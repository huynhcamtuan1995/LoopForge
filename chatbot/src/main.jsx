import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import SopDesigner from "./SopDesigner";
import { isDesignerSurface } from "./sop-designer.js";
import { applyDocumentLang, t } from "./i18n.js";
import "./styles.css";
import "./home.css";
import "./navigation.css";
import "../../web/app/hover-ink.css";
import "../../web/app/hover-ink.js";
import "./hui-tokens.css";
import "../../web/app/hui-controls.css";
import "../../web/app/hui-tooltip.js";
import "./navigation-motion.css";
import "./composer-context.css";
import "../../web/app/sliding-tabs.css";
applyDocumentLang();
if (typeof document !== "undefined") document.title = t("app.pageTitle");
class Boundary extends React.Component {
  state = { error: null };
  static getDerivedStateFromError(error) {
    return { error };
  }
  render() {
    return this.state.error ? (
      <div className="fatal-error">
        <h1>{t("app.fatalError.title")}</h1>
        <p>{this.state.error.message}</p>
        <button onClick={() => location.reload()}>{t("app.fatalError.reload")}</button>
      </div>
    ) : (
      this.props.children
    );
  }
}
createRoot(document.getElementById("root")).render(
  <Boundary>
    {isDesignerSurface(location.search) ? <SopDesigner /> : <App />}
  </Boundary>,
);
