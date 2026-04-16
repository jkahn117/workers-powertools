import { createFileRoute } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";

const getExampleData = createServerFn({ method: "GET" }).handler(async () => {
  return {
    message: "Workers Powertools is instrumenting this TanStack Start request.",
    generatedAt: new Date().toISOString(),
  };
});

export const Route = createFileRoute("/")({
  loader: () => getExampleData(),
  component: Home,
});

function Home() {
  const data = Route.useLoaderData();

  return (
    <main style={pageStyle}>
      <div style={layoutStyle}>
        <section style={heroStyle}>
          <p style={eyebrowStyle}>TanStack Start Example</p>
          <h1 style={titleStyle}>
            Request middleware and server function tracing on Workers.
          </h1>
          <p style={bodyStyle}>
            This example uses <code>@workers-powertools/tanstack-start</code> to inject
            logger, tracer, and metrics into TanStack Start's request lifecycle.
          </p>
          <ul style={listStyle}>
            <li>
              Request middleware wraps the whole request with observability utilities.
            </li>
            <li>Server function middleware traces the loader-backed server function.</li>
            <li>
              Metrics emit request count and duration when a pipeline binding is
              configured.
            </li>
          </ul>
        </section>

        <aside style={panelStyle}>
          <p style={panelLabelStyle}>Server function output</p>
          <p style={panelMessageStyle}>{data.message}</p>
          <p style={panelMetaStyle}>Generated at {data.generatedAt}</p>
        </aside>
      </div>
    </main>
  );
}

const pageStyle = {
  minHeight: "100vh",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  padding: "24px",
};

const layoutStyle = {
  width: "100%",
  maxWidth: "1100px",
  display: "grid",
  gap: "24px",
  gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
};

const heroStyle = {
  border: "1px solid rgba(56, 189, 248, 0.2)",
  borderRadius: "28px",
  padding: "32px",
  background: "linear-gradient(180deg, rgba(14, 165, 233, 0.12), rgba(15, 23, 42, 0.92))",
};

const eyebrowStyle = {
  margin: 0,
  color: "#38bdf8",
  fontSize: "12px",
  fontWeight: 700,
  letterSpacing: "0.08em",
  textTransform: "uppercase" as const,
};

const titleStyle = {
  margin: "14px 0 0",
  fontSize: "46px",
  lineHeight: 1,
  maxWidth: "12ch",
};

const bodyStyle = {
  margin: "18px 0 0",
  color: "#cbd5e1",
  lineHeight: 1.7,
  maxWidth: "58ch",
};

const listStyle = {
  margin: "22px 0 0",
  paddingLeft: "20px",
  color: "#e2e8f0",
  lineHeight: 1.8,
};

const panelStyle = {
  border: "1px solid rgba(148, 163, 184, 0.2)",
  borderRadius: "28px",
  padding: "32px",
  background: "rgba(15, 23, 42, 0.92)",
  display: "flex",
  flexDirection: "column" as const,
  justifyContent: "center",
};

const panelLabelStyle = {
  margin: 0,
  color: "#94a3b8",
  fontSize: "12px",
  fontWeight: 700,
  letterSpacing: "0.08em",
  textTransform: "uppercase" as const,
};

const panelMessageStyle = {
  margin: "16px 0 0",
  fontSize: "24px",
  lineHeight: 1.4,
};

const panelMetaStyle = {
  margin: "16px 0 0",
  color: "#94a3b8",
  fontSize: "14px",
};
