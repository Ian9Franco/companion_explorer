"use client";

import { FormEvent, useState } from "react";
import { motion } from "motion/react";
import { Check, Plus } from "lucide-react";
import { CollectionInfo, thumbUrl } from "../../lib/api";
import { formatCount } from "../../lib/format";
import { ease } from "../../lib/motion";
import { Modal } from "../ui/Modal";

type CollectionDialogProps = {
  count: number;
  collections: CollectionInfo[];
  excludeId: number | null;
  onPick: (collection: CollectionInfo) => Promise<void>;
  onCreateAndPick: (name: string) => Promise<void>;
  onClose: () => void;
};

export function CollectionDialog({ count, collections, excludeId, onPick, onCreateAndPick, onClose }: CollectionDialogProps) {
  const [name, setName] = useState("");
  const [busyId, setBusyId] = useState<number | "new" | null>(null);
  const options = collections.filter((c) => c.id !== excludeId);

  const create = async (event: FormEvent) => {
    event.preventDefault();
    const trimmed = name.trim();
    if (!trimmed || busyId !== null) return;
    setBusyId("new");
    await onCreateAndPick(trimmed);
    setBusyId(null);
  };

  return (
    <Modal
      title="Agregar a colección"
      subtitle={`${formatCount(count)} ${count === 1 ? "archivo" : "archivos"}. Quedan donde están; la colección solo los agrupa.`}
      className="collection-dialog"
      onClose={onClose}
    >
      <form className="collection-create" onSubmit={create}>
        <input
          data-autofocus
          value={name}
          maxLength={80}
          onChange={(e) => setName(e.target.value)}
          placeholder="Nueva colección…"
          aria-label="Nombre de la nueva colección"
        />
        <button type="submit" className="button" disabled={!name.trim() || busyId !== null}>
          <Plus size={15} />
          Crear y agregar
        </button>
      </form>

      {options.length > 0 ? (
        <div className="collection-grid">
          {options.map((collection, i) => (
            <motion.button
              key={collection.id}
              type="button"
              className={`collection-option ${busyId === collection.id ? "is-busy" : ""}`}
              disabled={busyId !== null}
              onClick={async () => {
                setBusyId(collection.id);
                await onPick(collection);
                setBusyId(null);
              }}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0, transition: { duration: 0.28, ease, delay: 0.04 + Math.min(i, 10) * 0.03 } }}
              whileHover={{ y: -2 }}
              whileTap={{ scale: 0.98 }}
            >
              <span className="collection-option-cover">
                {collection.coverPath ? <img src={thumbUrl(collection.coverPath, 240)} alt="" draggable={false} /> : null}
                <span className="collection-option-check">
                  <Check size={14} strokeWidth={3} />
                </span>
              </span>
              <strong>{collection.name}</strong>
              <small>{formatCount(collection.itemCount)} archivos</small>
            </motion.button>
          ))}
        </div>
      ) : (
        <p className="modal-empty">Todavía no hay colecciones. Poné un nombre arriba y se crea con esta selección.</p>
      )}
    </Modal>
  );
}
