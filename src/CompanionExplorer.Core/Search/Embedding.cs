namespace CompanionExplorer.Core.Search;

/// <summary>
/// Capa 1 de la búsqueda visual. Un vector y la identidad del modelo que lo produjo.
/// No hay índice, ni archivo, ni forma de calcularlo: las capas de arriba hablan este tipo.
/// El id del modelo viaja con el vector para que un modelo nuevo no se escriba encima de otro.
/// </summary>
public sealed record EmbeddingModel
{
    public EmbeddingModel(string id, int dimensions)
    {
        if (string.IsNullOrWhiteSpace(id))
            throw new ArgumentException("El modelo de embeddings necesita un id.", nameof(id));
        if (dimensions <= 0)
            throw new ArgumentOutOfRangeException(nameof(dimensions), "Un embedding tiene al menos una dimensión.");

        Id = id.Trim();
        Dimensions = dimensions;
    }

    /// <summary>Identidad estable del modelo. Cambiar de modelo es cambiar este id.</summary>
    public string Id { get; }

    public int Dimensions { get; }
}

/// <summary>
/// Un vector ya calculado. Se queda con una copia: quien lo construyó puede seguir
/// usando su arreglo. Rechaza una longitud distinta a la del modelo, y NaN o infinitos,
/// porque con eso una comparación de cercanía deja de tener sentido.
/// </summary>
public sealed class Embedding
{
    private readonly float[] _values;

    public Embedding(EmbeddingModel model, ReadOnlySpan<float> values)
    {
        ArgumentNullException.ThrowIfNull(model);
        if (values.Length != model.Dimensions)
        {
            throw new ArgumentException(
                $"El modelo «{model.Id}» espera {model.Dimensions} dimensiones y el vector trae {values.Length}.",
                nameof(values));
        }

        var copy = new float[values.Length];
        for (var i = 0; i < values.Length; i++)
        {
            if (!float.IsFinite(values[i]))
                throw new ArgumentException("El vector solo acepta números finitos.", nameof(values));
            copy[i] = values[i];
        }

        Model = model;
        _values = copy;
    }

    public EmbeddingModel Model { get; }

    public ReadOnlyMemory<float> Values => _values;
}
