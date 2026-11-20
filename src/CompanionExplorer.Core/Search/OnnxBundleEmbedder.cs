using Microsoft.ML.OnnxRuntime;
using Microsoft.ML.OnnxRuntime.Tensors;
using Microsoft.ML.Tokenizers;

namespace CompanionExplorer.Core.Search;

/// <summary>
/// Embedder local SigLIP/CLIP exportado a <c>image.onnx</c> y <c>text.onnx</c> en el bundle.
/// </summary>
public sealed class OnnxBundleEmbedder : IEmbedder, IDisposable
{
    private readonly EmbeddingModel _model;
    private readonly InferenceSession? _imageSession;
    private readonly InferenceSession? _textSession;
    private readonly BpeTokenizer? _tokenizer;
    private readonly string _imageInputName;
    private readonly string _textInputIdsName;
    private readonly string? _textAttentionName;

    private OnnxBundleEmbedder(
        ModelBundleSpec bundle,
        InferenceSession? imageSession,
        InferenceSession? textSession,
        BpeTokenizer? tokenizer,
        string imageInputName,
        string textInputIdsName,
        string? textAttentionName)
    {
        _model = new EmbeddingModel(bundle.Id, bundle.Dimensions);
        _imageSession = imageSession;
        _textSession = textSession;
        _tokenizer = tokenizer;
        _imageInputName = imageInputName;
        _textInputIdsName = textInputIdsName;
        _textAttentionName = textAttentionName;
    }

    public EmbeddingModel Model => _model;

    public bool IsReady => _imageSession is not null || (_textSession is not null && _tokenizer is not null);

    public static OnnxBundleEmbedder? TryCreate(ModelBundleSpec bundle)
    {
        ArgumentNullException.ThrowIfNull(bundle);
        if (!ModelManifestIO.BundleIsComplete(bundle))
            return null;

        var dir = ModelPaths.BundleDirectory(bundle.Id);
        var imagePath = Path.Combine(dir, "image.onnx");
        var textPath = Path.Combine(dir, "text.onnx");
        InferenceSession? imageSession = null;
        InferenceSession? textSession = null;
        BpeTokenizer? tokenizer = null;

        try
        {
            var options = CreateSessionOptions();

            if (File.Exists(imagePath))
                imageSession = new InferenceSession(imagePath, options);

            if (File.Exists(textPath))
            {
                textSession = new InferenceSession(textPath, options);
                var vocabPath = Path.Combine(dir, "vocab.json");
                var mergesPath = Path.Combine(dir, "merges.txt");
                if (File.Exists(vocabPath) && File.Exists(mergesPath))
                    tokenizer = BpeTokenizer.Create(vocabPath, mergesPath);
            }

            if (imageSession is null && textSession is null)
                return null;

            var imageInput = imageSession is null
                ? "pixel_values"
                : PickInputName(imageSession.InputMetadata, "pixel_values", "input", "images");

            var textInputIds = textSession is null
                ? "input_ids"
                : PickInputName(textSession.InputMetadata, "input_ids", "tokens");

            string? textAttention = null;
            if (textSession is not null)
            {
                if (textSession.InputMetadata.ContainsKey("attention_mask"))
                    textAttention = "attention_mask";
            }

            return new OnnxBundleEmbedder(
                bundle,
                imageSession,
                textSession,
                tokenizer,
                imageInput,
                textInputIds,
                textAttention);
        }
        catch
        {
            imageSession?.Dispose();
            textSession?.Dispose();
            return null;
        }
    }

    public ValueTask<Embedding?> EmbedTextAsync(string text, CancellationToken cancellationToken = default)
    {
        if (_textSession is null || _tokenizer is null || string.IsNullOrWhiteSpace(text))
            return ValueTask.FromResult<Embedding?>(null);

        cancellationToken.ThrowIfCancellationRequested();

        try
        {
            var ids = _tokenizer.EncodeToIds(text.Trim()).Select(i => (long)i).ToArray();
            if (ids.Length == 0)
                return ValueTask.FromResult<Embedding?>(null);

            var seqLen = ids.Length;
            var inputIds = new DenseTensor<long>(new[] { 1, seqLen });
            for (var i = 0; i < seqLen; i++)
                inputIds[0, i] = ids[i];

            var inputs = new List<NamedOnnxValue>
            {
                NamedOnnxValue.CreateFromTensor(_textInputIdsName, inputIds)
            };

            if (_textAttentionName is not null)
            {
                var mask = new DenseTensor<long>(new[] { 1, seqLen });
                for (var i = 0; i < seqLen; i++)
                    mask[0, i] = 1;
                inputs.Add(NamedOnnxValue.CreateFromTensor(_textAttentionName, mask));
            }

            using var results = _textSession.Run(inputs);
            var vector = ExtractVector(results, _model.Dimensions);
            return ValueTask.FromResult<Embedding?>(new Embedding(_model, vector));
        }
        catch
        {
            return ValueTask.FromResult<Embedding?>(null);
        }
    }

    public ValueTask<Embedding?> EmbedImageAsync(string filePath, CancellationToken cancellationToken = default)
    {
        if (_imageSession is null)
            return ValueTask.FromResult<Embedding?>(null);

        cancellationToken.ThrowIfCancellationRequested();

        try
        {
            var pixelTensor = OnnxClipImagePreprocessor.BuildPixelTensor(filePath);
            var inputs = new[] { NamedOnnxValue.CreateFromTensor(_imageInputName, pixelTensor) };
            using var results = _imageSession.Run(inputs);
            var vector = ExtractVector(results, _model.Dimensions);
            return ValueTask.FromResult<Embedding?>(new Embedding(_model, vector));
        }
        catch
        {
            return ValueTask.FromResult<Embedding?>(null);
        }
    }

    public void Dispose()
    {
        _imageSession?.Dispose();
        _textSession?.Dispose();
    }

    private static SessionOptions CreateSessionOptions()
    {
        var options = new SessionOptions
        {
            GraphOptimizationLevel = GraphOptimizationLevel.ORT_ENABLE_ALL
        };

        if (OperatingSystem.IsWindows())
        {
            try
            {
                options.AppendExecutionProvider_DML();
                return options;
            }
            catch
            {
                // CPU fallback.
            }
        }

        options.AppendExecutionProvider_CPU();
        return options;
    }

    private static string PickInputName(IReadOnlyDictionary<string, NodeMetadata> metadata, params string[] preferred)
    {
        foreach (var name in preferred)
        {
            if (metadata.ContainsKey(name))
                return name;
        }

        return metadata.Keys.First();
    }

    private static float[] ExtractVector(IDisposableReadOnlyCollection<DisposableNamedOnnxValue> results, int dimensions)
    {
        var first = results.FirstOrDefault();
        if (first?.Value is not Tensor<float> tensor)
            throw new InvalidOperationException("La salida ONNX no es un tensor float.");

        return OnnxEmbeddingMath.ToVectorAndNormalize(tensor.ToArray(), dimensions);
    }
}