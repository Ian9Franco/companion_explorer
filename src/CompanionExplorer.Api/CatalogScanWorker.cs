using System.Collections.Concurrent;
using System.Threading.Channels;
using CompanionExplorer.Core.Catalog;

namespace CompanionExplorer.Api;

public sealed record ScanSnapshot(string Status, int Scanned, string? Error);

/// <summary>
/// Escanea de a una biblioteca, para que dos recorridos no peleen el mismo disco.
/// Si llega un rescan mientras esa biblioteca ya se está escaneando, se anota y
/// se corre al terminar. Cancelar corta el recorrido en curso y no borra filas:
/// el scanner solo poda lo que no vio cuando el recorrido termina entero.
/// </summary>
public sealed class CatalogScanWorker(
    CatalogStore store,
    CatalogScanner scanner,
    IConfiguration configuration,
    ILogger<CatalogScanWorker> logger) : BackgroundService
{
    private readonly Channel<long> _queue = Channel.CreateUnbounded<long>(new UnboundedChannelOptions { SingleReader = true });
    private readonly ConcurrentDictionary<long, ScanState> _states = new();
    private readonly object _gate = new();
    private long _currentId;
    private CancellationTokenSource? _currentCancellation;

    public void Enqueue(long libraryId)
    {
        var state = _states.GetOrAdd(libraryId, _ => new ScanState());
        lock (state)
        {
            if (state.Status == "queued")
                return;
            if (state.Status == "scanning")
            {
                state.RescanRequested = true;
                return;
            }

            state.Status = "queued";
            state.Error = null;
        }

        _queue.Writer.TryWrite(libraryId);
    }

    public void Cancel(long libraryId)
    {
        _states.TryRemove(libraryId, out _);
        lock (_gate)
        {
            if (_currentId == libraryId)
                _currentCancellation?.Cancel();
        }
    }

    public ScanSnapshot? GetSnapshot(long libraryId)
    {
        if (!_states.TryGetValue(libraryId, out var state))
            return null;
        lock (state)
            return new ScanSnapshot(state.Status, state.Scanned, state.Error);
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        if (!string.Equals(configuration["COMPANION_SCAN_ON_START"], "false", StringComparison.OrdinalIgnoreCase))
        {
            foreach (var library in store.ListLibraries())
                Enqueue(library.Id);
        }

        await foreach (var libraryId in _queue.Reader.ReadAllAsync(stoppingToken))
        {
            if (!_states.TryGetValue(libraryId, out var state))
                continue;

            using var cancellation = CancellationTokenSource.CreateLinkedTokenSource(stoppingToken);
            lock (_gate)
            {
                _currentId = libraryId;
                _currentCancellation = cancellation;
            }

            lock (state)
            {
                state.Status = "scanning";
                state.Scanned = 0;
            }

            try
            {
                var progress = new InlineProgress(count =>
                {
                    lock (state)
                        state.Scanned = count;
                });
                var result = await Task.Run(() => scanner.Scan(libraryId, progress, cancellation.Token), cancellation.Token);
                logger.LogInformation(
                    "Biblioteca {LibraryId}: {Indexed} archivos indexados, {Removed} quitados.",
                    libraryId, result.Indexed, result.Removed);
                lock (state)
                    state.Status = "idle";
            }
            catch (OperationCanceledException) when (!stoppingToken.IsCancellationRequested)
            {
                lock (state)
                    state.Status = "idle";
            }
            catch (KeyNotFoundException)
            {
                _states.TryRemove(libraryId, out _);
            }
            catch (Exception ex) when (ex is not OperationCanceledException)
            {
                logger.LogError(ex, "Falló el escaneo de la biblioteca {LibraryId}.", libraryId);
                lock (state)
                {
                    state.Status = "error";
                    state.Error = ex.Message;
                }
            }
            finally
            {
                lock (_gate)
                {
                    _currentId = 0;
                    _currentCancellation = null;
                }
            }

            bool rescan;
            lock (state)
            {
                rescan = state.RescanRequested;
                state.RescanRequested = false;
            }

            if (rescan)
                Enqueue(libraryId);
        }
    }

    private sealed class ScanState
    {
        public string Status = "idle";
        public int Scanned;
        public string? Error;
        public bool RescanRequested;
    }

    private sealed class InlineProgress(Action<int> report) : IProgress<int>
    {
        public void Report(int value) => report(value);
    }
}
