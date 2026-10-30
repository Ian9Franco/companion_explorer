"use client";

import { useState } from "react";
import { Modal } from "../ui/Modal";

export type ConfirmRequest = {
  title: string;
  body: string;
  confirmLabel: string;
  danger?: boolean;
  run: () => Promise<void> | void;
};

export function ConfirmDialog({ request, onClose }: { request: ConfirmRequest; onClose: () => void }) {
  const [busy, setBusy] = useState(false);

  return (
    <Modal title={request.title} className="confirm-dialog" onClose={onClose}>
      <p className="confirm-body">{request.body}</p>
      <footer className="modal-footer">
        <button type="button" className="button is-secondary" onClick={onClose}>
          Cancelar
        </button>
        <button
          type="button"
          data-autofocus
          className={`button ${request.danger ? "is-danger" : ""}`}
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            try {
              await request.run();
            } finally {
              setBusy(false);
            }
            onClose();
          }}
        >
          {request.confirmLabel}
        </button>
      </footer>
    </Modal>
  );
}
