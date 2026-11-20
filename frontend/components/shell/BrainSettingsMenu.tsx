"use client";

import { FormEvent, useEffect, useState } from "react";
import { BrainSettingsPatch, BrainSettingsView } from "../../lib/api";
import { messageOf } from "../../lib/sources";

type BrainSettingsMenuProps = {
  config: BrainSettingsView;
  onSave: (patch: BrainSettingsPatch) => Promise<void>;
  onClose: () => void;
};

export function BrainSettingsMenu({ config, onSave, onClose }: BrainSettingsMenuProps) {
  const [embedder, setEmbedder] = useState(config.embedder === "provider" ? "provider" : "local");
  const [localBundleId, setLocalBundleId] = useState(config.localBundleId);
  const [providerId, setProviderId] = useState(config.provider?.providerId ?? config.providerOptions[0]?.id ?? "");
  const [modelId, setModelId] = useState(config.provider?.modelId ?? "");
  const [apiKey, setApiKey] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setEmbedder(config.embedder === "provider" ? "provider" : "local");
    setLocalBundleId(config.localBundleId);
    setProviderId(config.provider?.providerId ?? config.providerOptions[0]?.id ?? "");
    setModelId(config.provider?.modelId ?? "");
    setApiKey("");
  }, [config]);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
  try {
      const patch: BrainSettingsPatch = {
        embedder,
        localBundleId,
        provider: embedder === "provider" ? { providerId, modelId: modelId.trim() } : null
      };
      if (apiKey.trim()) patch.providerApiKey = apiKey.trim();
      await onSave(patch);
      setApiKey("");
      onClose();
    } catch (err: unknown) {
      setError(messageOf(err));
    } finally {
      setBusy(false);
    }
  };

  const clearKey = async () => {
    setBusy(true);
    setError(null);
    try {
      await onSave({ clearProviderApiKey: true });
      setApiKey("");
    } catch (err: unknown) {
      setError(messageOf(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <form className="brain-settings" onSubmit={submit}>
      <div className="menu-title">Motor de búsqueda visual</div>
      <p className="brain-settings-lead">Local por defecto. El proveedor usa tu cuenta; la key queda cifrada en esta PC.</p>

      <div className="brain-settings-mode" role="radiogroup" aria-label="Origen del modelo">
        <label className={`brain-settings-radio ${embedder === "local" ? "is-active" : ""}`}>
          <input type="radio" name="embedder" checked={embedder === "local"} onChange={() => setEmbedder("local")} />
          <span>Local (ONNX)</span>
        </label>
        <label className={`brain-settings-radio ${embedder === "provider" ? "is-active" : ""}`}>
          <input type="radio" name="embedder" checked={embedder === "provider"} onChange={() => setEmbedder("provider")} />
          <span>Proveedor (tu API)</span>
        </label>
      </div>

      {embedder === "local" ? (
        <label className="brain-settings-field">
          <span>Bundle instalado</span>
          <select value={localBundleId} onChange={(e) => setLocalBundleId(e.target.value)}>
            {config.availableBundles.map((bundle) => (
              <option key={bundle.id} value={bundle.id}>
                {bundle.label} {bundle.installed ? "· listo" : "· faltan archivos"}
              </option>
            ))}
          </select>
        </label>
      ) : (
        <>
          <label className="brain-settings-field">
            <span>Proveedor</span>
            <select value={providerId} onChange={(e) => setProviderId(e.target.value)}>
              {config.providerOptions.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label} {p.implemented ? "" : "(próximamente)"}
                </option>
              ))}
            </select>
          </label>
          <label className="brain-settings-field">
            <span>Modelo</span>
            <input
              value={modelId}
              onChange={(e) => setModelId(e.target.value)}
              placeholder="ej. text-embedding-3-small"
              spellCheck={false}
            />
          </label>
          <label className="brain-settings-field">
            <span>API key</span>
            <input
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder={config.providerKeyConfigured ? "•••• guardada — pegá solo para cambiar" : "Pegá tu clave"}
              autoComplete="off"
            />
          </label>
          {config.providerKeyConfigured ? (
            <p className="brain-settings-hint">
              {config.providerKeyStoredOnDisk
                ? "Clave guardada cifrada en tu carpeta de Companion (DPAPI)."
                : "Clave tomada de variable de entorno en esta sesión."}
            </p>
          ) : null}
          {!config.providerImplemented ? (
            <p className="brain-settings-hint">Todavía no hay llamadas al proveedor; podés dejar la key lista.</p>
          ) : null}
          {config.providerKeyStoredOnDisk ? (
            <button type="button" className="button is-secondary brain-settings-clear" onClick={() => void clearKey()} disabled={busy}>
              Quitar clave guardada
            </button>
          ) : null}
        </>
      )}

      {error ? <p className="brain-settings-error">{error}</p> : null}

      <div className="brain-settings-actions">
        <button type="button" className="button is-secondary" onClick={onClose} disabled={busy}>
          Cancelar
        </button>
        <button type="submit" className="button" disabled={busy}>
          Guardar
        </button>
      </div>
    </form>
  );
}