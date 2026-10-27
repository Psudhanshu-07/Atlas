import { useCallback, useEffect, useState } from "react";
import { api, type ConfigResponse } from "../../api";
import { Spinner } from "../ui";
import { Check, RefreshCw } from "lucide-react";
import type { SessionUser } from "../../../../shared/types";
import { Card } from "./SettingsCard";

export function AiSection({ user, onShowToast }: { user: SessionUser; onShowToast: (msg: string) => void }) {
  const [config, setConfig] = useState<ConfigResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [apiKeyInput, setApiKeyInput] = useState("");

  const load = useCallback(async () => {
    setError(null);
    try {
      const cfg = await api.getConfig();
      setConfig(cfg);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const save = async () => {
    if (!config) return;
    setSaving(true);
    try {
      const updated = await api.updateConfig({
        model: config.model,
        ignorePatterns: config.ignorePatterns,
        maxDepth: config.maxDepth,
        ...(apiKeyInput ? { apiKey: apiKeyInput } : {}),
      });
      setConfig(updated);
      setApiKeyInput("");
      onShowToast("AI configuration saved.");
    } catch (err) {
      onShowToast(err instanceof Error ? err.message : "Could not save the configuration.");
    } finally {
      setSaving(false);
    }
  };

  if (error) {
    return (
      <Card title="Atlas AI">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <span className="form-help-error">{error}</span>
          <button className="btn ghost" onClick={() => void load()}>
            <RefreshCw size={13} /> Retry
          </button>
        </div>
      </Card>
    );
  }

  if (!config) {
    return (
      <Card title="Atlas AI">
        <div className="flex items-center gap-2 text-on-surface-variant text-body-compact">
          <Spinner size={14} /> Loading AI configuration…
        </div>
      </Card>
    );
  }

  return (
    <>
      <Card title="Atlas AI" description="How Atlas answers questions about your code.">
        <div className="form-row-2">
          <div className="form-group">
            <label className="form-label">Engine status</label>
            <input
              className="text-input"
              value={config.aiEnabled ? `Enabled · ${config.model}` : "Disabled (heuristic answers only)"}
              disabled
            />
          </div>
          <div className="form-group">
            <label className="form-label">Provider</label>
            <input className="text-input" value={config.provider} disabled />
          </div>
        </div>
        <p className="form-help-text">
          When the engine is off, Atlas answers from the deterministic analysis graph — no code ever
          leaves your machine in either mode unless a provider is configured.
        </p>
      </Card>

      {user.isAdmin ? (
        <Card
          title="Engine configuration"
          description="Workspace-wide settings, editable by the admin only."
        >
          <div className="form-row-2">
            <div className="form-group">
              <label className="form-label" htmlFor="ai-model">
                Model
              </label>
              <input
                id="ai-model"
                className="text-input"
                value={config.model}
                onChange={(e) => setConfig({ ...config, model: e.target.value })}
                disabled={saving}
              />
            </div>
            <div className="form-group">
              <label className="form-label" htmlFor="ai-key">
                API key
              </label>
              <input
                id="ai-key"
                className="text-input"
                type="password"
                value={apiKeyInput}
                placeholder={config.hasKey ? `Saved (${config.apiKey})` : "Not set"}
                onChange={(e) => setApiKeyInput(e.target.value)}
                disabled={saving}
                autoComplete="off"
              />
              <span className="form-help-text">
                Leave blank to keep the stored key. Never shown in full.
              </span>
            </div>
          </div>
          <div className="form-group">
            <label className="form-label" htmlFor="ai-ignore">
              Ignore patterns
            </label>
            <textarea
              id="ai-ignore"
              className="text-input settings-bio"
              rows={2}
              value={config.ignorePatterns}
              onChange={(e) => setConfig({ ...config, ignorePatterns: e.target.value })}
              disabled={saving}
            />
            <span className="form-help-text">One glob per line; matched files are skipped by the crawler.</span>
          </div>
          <div className="form-group">
            <label className="form-label" htmlFor="ai-depth">
              Max crawl depth
            </label>
            <input
              id="ai-depth"
              className="text-input"
              type="number"
              min={1}
              max={64}
              value={config.maxDepth}
              onChange={(e) => setConfig({ ...config, maxDepth: Number(e.target.value) })}
              disabled={saving}
              style={{ maxWidth: 140 }}
            />
          </div>
          <div className="settings-save-row">
            <button className="btn primary" onClick={() => void save()} disabled={saving}>
              {saving ? <Spinner size={13} /> : <Check size={13} />} Save configuration
            </button>
          </div>
        </Card>
      ) : (
        <Card title="Engine configuration" description="Managed by the workspace admin.">
          <p className="form-help-text" style={{ marginTop: 0 }}>
            Only the workspace admin can change the AI engine configuration.
          </p>
        </Card>
      )}
    </>
  );
}
