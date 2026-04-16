import {
  createRootRoute,
  HeadContent,
  Link,
  Outlet,
  Scripts,
} from "@tanstack/react-router";
import type { ReactNode } from "react";

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "Workers Powertools TanStack Start Example" },
      {
        name: "description",
        content:
          "Minimal TanStack Start example using Workers Powertools request and server function middleware.",
      },
    ],
  }),
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
});

function RootComponent() {
  return (
    <Document>
      <Outlet />
    </Document>
  );
}

function NotFoundComponent() {
  return (
    <main style={pageStyle}>
      <div style={cardStyle}>
        <p style={eyebrowStyle}>404</p>
        <h1 style={titleStyle}>Page not found</h1>
        <p style={bodyStyle}>The route you requested is not part of this example app.</p>
        <Link to="/" style={buttonStyle}>
          Return home
        </Link>
      </div>
    </main>
  );
}

function Document(props: { children: ReactNode }) {
  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body style={shellStyle}>
        {props.children}
        <Scripts />
      </body>
    </html>
  );
}

const shellStyle = {
  margin: 0,
  fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif",
  background: "#0b1020",
  color: "#f8fafc",
};

const pageStyle = {
  minHeight: "100vh",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  padding: "24px",
};

const cardStyle = {
  width: "100%",
  maxWidth: "560px",
  border: "1px solid rgba(148, 163, 184, 0.2)",
  borderRadius: "24px",
  background: "rgba(15, 23, 42, 0.9)",
  padding: "32px",
  boxSizing: "border-box" as const,
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
  margin: "12px 0 0",
  fontSize: "32px",
  lineHeight: 1.1,
};

const bodyStyle = {
  margin: "12px 0 0",
  color: "#cbd5e1",
  lineHeight: 1.6,
};

const buttonStyle = {
  display: "inline-block",
  marginTop: "20px",
  padding: "10px 14px",
  borderRadius: "12px",
  background: "#38bdf8",
  color: "#0f172a",
  fontWeight: 700,
  textDecoration: "none",
};
