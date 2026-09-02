import React from "react";
import { Adaptive, useAdaptive } from "@mindra.dev/react";

const TRACKED = [
  { id: "export", label: "Export" },
  { id: "search", label: "Search" },
  { id: "delete", label: "Delete" },
  { id: "help", label: "Help" },
];

/** Live readout of what the runtime currently believes about one element. */
function ElementMeter({ id, label }: { id: string; label: string }) {
  const { familiarity, friction, confidence, expertise, suggestion } = useAdaptive(id);

  return (
    <div className="meter">
      <div className="meter-head">
        <span className="meter-name">{label}</span>
        <span className={`tier tier-${expertise}`}>{expertise}</span>
      </div>
      {(
        [
          ["familiarity", familiarity],
          ["friction", friction],
          ["confidence", confidence],
        ] as const
      ).map(([name, value]) => (
        <div key={name} className="bar-row">
          <span className="bar-label">{name}</span>
          <div className="bar-track">
            <div className={`bar-fill bar-${name}`} style={{ width: `${value * 100}%` }} />
          </div>
          <span className="bar-value">{value.toFixed(2)}</span>
        </div>
      ))}
      <div className="suggestion">
        suggestion: <code>{suggestion}</code>
      </div>
    </div>
  );
}

export function App() {
  const deleteState = useAdaptive("delete");
  const [log, setLog] = React.useState<string[]>([]);

  const note = (msg: string) => setLog((l) => [msg, ...l].slice(0, 6));

  // The point of the library in one function: the same click means different
  // things depending on how well this user knows this particular control.
  const handleDelete = () => {
    if (deleteState.expertise === "novice" || deleteState.expertise === "learning") {
      note("Delete → confirmation dialog (still learning this control)");
    } else {
      note("Delete → executed instantly, with an undo toast");
    }
  };

  const reset = () => {
    localStorage.removeItem("mindra_stats_mindra-example");
    location.reload();
  };

  return (
    <div className="page">
      <header>
        <h1>mindra</h1>
        <p>
          Click the toolbar. Each control tracks how familiar <em>you</em> are with{" "}
          <em>it</em>, and adapts on its own.
        </p>
      </header>

      <div className="layout">
        <section className="panel">
          <h2>A toolbar that learns</h2>

          <div className="toolbar">
            <Adaptive
              id="export"
              novice="Export this project as a PDF"
              learning="Export as PDF"
              proficient="Export"
              expert="Export"
            >
              <button className="btn" onClick={() => note("Export → file generated")}>
                Export
              </button>
            </Adaptive>

            <Adaptive
              id="search"
              novice="Search across all your projects and files"
              learning="Search projects and files"
              proficient="Search…"
              expert="⌘K"
            >
              <input className="input" />
            </Adaptive>

            <button className="btn btn-danger" data-adaptive-id="delete" onClick={handleDelete}>
              Delete
            </button>

            <Adaptive
              id="help"
              novice="Not sure where to start? Read the guide"
              learning="Open the guide"
              proficient="Guide"
              expert="?"
            >
              <button className="btn btn-ghost" onClick={() => note("Help → guide opened")}>
                Help
              </button>
            </Adaptive>
          </div>

          <p className="hint">
            The Delete button changes <em>behaviour</em> rather than copy — it asks for
            confirmation until you have shown you know what it does.
          </p>

          <div className="log">
            {log.length === 0 ? (
              <span className="log-empty">Interactions appear here…</span>
            ) : (
              log.map((l, i) => (
                <div key={i} className="log-line" style={{ opacity: 1 - i * 0.13 }}>
                  {l}
                </div>
              ))
            )}
          </div>
        </section>

        <aside className="panel">
          <h2>What the runtime believes</h2>
          {TRACKED.map((el) => (
            <ElementMeter key={el.id} {...el} />
          ))}
          <button className="btn btn-ghost reset" onClick={reset}>
            Reset this browser's history
          </button>
        </aside>
      </div>

      <footer>
        Nothing here leaves your browser. State lives in <code>localStorage</code>, and the
        runtime makes no network requests.
      </footer>
    </div>
  );
}
