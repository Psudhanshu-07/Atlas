import type { ReactNode } from "react";

/** Headed card shell used by every settings section. */
export function Card({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <section className="settings-card">
      <div className="settings-card-head">
        <div className="flex flex-col gap-0.5">
          <h3>{title}</h3>
          {description && <p className="settings-card-desc">{description}</p>}
        </div>
      </div>
      <div className="settings-form">{children}</div>
    </section>
  );
}