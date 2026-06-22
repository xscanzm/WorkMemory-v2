// Mascot 窗口入口

import React from "react";
import ReactDOM from "react-dom/client";
import { Mascot } from "./Mascot";
import "./mascot.css";

ReactDOM.createRoot(document.getElementById("mascot-root") as HTMLElement).render(
  <React.StrictMode>
    <Mascot />
  </React.StrictMode>
);
