export const topologyStyles = `
.WorkloadTopology {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 680px;
  color: var(--textColorPrimary);
  background: var(--layoutBackground);
}

.WorkloadTopology__toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 14px 18px;
  border-bottom: 1px solid var(--borderColor);
}

.WorkloadTopology__toolbar h2 {
  margin: 0 0 5px;
  font-size: 18px;
  font-weight: 600;
}

.WorkloadTopology__summary {
  display: flex;
  flex-wrap: wrap;
  gap: 2px 4px;
}

.WorkloadTopology__summaryItem {
  font-size: 11px;
  color: var(--textColorSecondary);
}

.WorkloadTopology__summaryItem strong {
  font-weight: 700;
  color: var(--textColorPrimary);
  margin-right: 1px;
}

.WorkloadTopology__summaryItem:not(:last-child)::after {
  content: "\\00b7";
  margin-left: 4px;
  opacity: 0.35;
}

.WorkloadTopology__summaryDivider {
  width: 1px;
  height: 10px;
  margin: 0 4px;
  background: var(--borderColor);
  flex-shrink: 0;
}

.WorkloadTopology__statusBadge {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 0 7px;
  font-size: 10px;
  font-weight: 700;
  line-height: 17px;
  border-radius: 9px;
  white-space: nowrap;
}

.WorkloadTopology__statusBadge::before {
  content: "";
  width: 6px;
  height: 6px;
  border-radius: 50%;
  flex-shrink: 0;
}

.WorkloadTopology__statusBadge.is-danger {
  color: #e85656;
  background: rgba(212, 72, 72, 0.12);
}

.WorkloadTopology__statusBadge.is-danger::before {
  background: #d44848;
}

.WorkloadTopology__statusBadge.is-warning {
  color: #d99b20;
  background: rgba(217, 155, 32, 0.1);
}

.WorkloadTopology__statusBadge.is-warning::before {
  background: #d99b20;
}

.WorkloadTopology__toolbar span {
  color: var(--textColorSecondary);
  font-size: 12px;
}

.WorkloadTopology__actions {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
}

.WorkloadTopology__search {
  position: relative;
  display: flex;
  align-items: center;
}

.WorkloadTopology__search input {
  width: 36px;
  height: 30px;
  padding: 0 10px 0 30px;
  color: var(--textColorPrimary);
  background: rgba(127, 180, 255, 0.06);
  border: 1px solid transparent;
  border-radius: 15px;
  font-size: 12px;
  outline: none;
  cursor: pointer;
  transition: width 0.3s cubic-bezier(0.4, 0, 0.2, 1),
              background 0.2s,
              border-color 0.2s,
              box-shadow 0.2s,
              padding 0.3s cubic-bezier(0.4, 0, 0.2, 1);
}

.WorkloadTopology__search input:focus {
  width: 220px;
  padding: 0 30px 0 30px;
  background: var(--contentColor);
  border-color: rgba(75, 123, 236, 0.5);
  box-shadow: 0 0 0 3px rgba(75, 123, 236, 0.12), 0 2px 8px rgba(0, 0, 0, 0.15);
  cursor: text;
}

.WorkloadTopology__search input.has-value {
  width: 220px;
  padding: 0 30px 0 30px;
  background: var(--contentColor);
  border-color: rgba(75, 123, 236, 0.35);
  cursor: text;
}

.WorkloadTopology__search::before {
  content: "";
  position: absolute;
  left: 10px;
  width: 14px;
  height: 14px;
  border: 1.5px solid var(--textColorSecondary);
  border-radius: 50%;
  pointer-events: none;
  z-index: 1;
  opacity: 0.5;
  transition: opacity 0.2s;
}

.WorkloadTopology__search::after {
  content: "";
  position: absolute;
  left: 22px;
  top: 50%;
  width: 1.5px;
  height: 5px;
  background: var(--textColorSecondary);
  transform: translateY(2px) rotate(-45deg);
  transform-origin: top;
  pointer-events: none;
  z-index: 1;
  opacity: 0.5;
  transition: opacity 0.2s;
}

.WorkloadTopology__search:focus-within::before,
.WorkloadTopology__search:focus-within::after {
  opacity: 0.9;
  border-color: #7fb4ff;
  background: #7fb4ff;
}

.WorkloadTopology__search:focus-within::before {
  background: none;
}

.WorkloadTopology__search input::placeholder {
  color: var(--textColorSecondary);
  opacity: 0;
  transition: opacity 0.2s 0.1s;
}

.WorkloadTopology__search input:focus::placeholder {
  opacity: 0.5;
}

.WorkloadTopology__search button {
  position: absolute;
  right: 7px;
  width: 16px;
  height: 16px;
  padding: 0;
  border: none;
  background: none;
  color: var(--textColorSecondary);
  font-size: 12px;
  line-height: 1;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  opacity: 0.5;
  transition: opacity 0.15s;
}

.WorkloadTopology__search button:hover {
  opacity: 1;
}

.WorkloadTopology__searchCount {
  flex-shrink: 0;
  margin-left: 8px;
  padding: 2px 8px;
  font-size: 11px;
  font-weight: 600;
  color: #7fb4ff;
  background: rgba(127, 180, 255, 0.1);
  border-radius: 10px;
  white-space: nowrap;
}

.WorkloadTopology__filter {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-shrink: 0;
}

.WorkloadTopology__filter span {
  color: var(--textColorSecondary);
  font-size: 11px;
  flex-shrink: 0;
}

.WorkloadTopology__filter select {
  width: 100px;
  height: 30px;
  padding: 0 8px;
  color: var(--textColorPrimary);
  background: var(--contentColor);
  border: 1px solid var(--borderColor);
  border-radius: 4px;
  text-align: center;
  text-overflow: ellipsis;
  overflow: hidden;
  white-space: nowrap;
}

.WorkloadTopology__actions button {
  min-width: 34px;
  height: 30px;
  padding: 0 10px;
  color: var(--textColorPrimary);
  background: var(--contentColor);
  border: 1px solid var(--borderColor);
  border-radius: 4px;
  cursor: pointer;
}

.WorkloadTopology__error,
.WorkloadTopology__state {
  margin: 14px 18px 0;
  padding: 10px 12px;
  border-radius: 4px;
  background: var(--contentColor);
}

.WorkloadTopology__error {
  color: var(--colorError);
}

.WorkloadTopology__metricsHint {
  position: relative;
  margin: 8px 18px 0;
  padding: 10px 32px 10px 12px;
  border-radius: 6px;
  background: rgba(217, 155, 32, 0.1);
  border: 1px solid rgba(217, 155, 32, 0.3);
  color: var(--textColorPrimary);
  font-size: 12px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.WorkloadTopology__metricsHint code {
  font-family: var(--font-monospace, monospace);
  font-size: 11px;
  background: rgba(0,0,0,0.2);
  padding: 2px 5px;
  border-radius: 3px;
}

.WorkloadTopology__metricsSubHint {
  font-size: 11px;
  color: var(--textColorSecondary);
  margin-top: 2px;
}

.WorkloadTopology__metricsCmd {
  display: block;
  width: 100%;
  padding: 6px 10px !important;
  background: rgba(0,0,0,0.3) !important;
  border-radius: 4px !important;
  cursor: pointer;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  transition: background 0.15s;
}

.WorkloadTopology__metricsCmd:hover {
  background: rgba(0,0,0,0.45) !important;
}

.WorkloadTopology__metricsHintClose {
  position: absolute;
  top: 6px;
  right: 6px;
  background: none;
  border: none;
  color: var(--textColorSecondary);
  font-size: 16px;
  cursor: pointer;
  padding: 0 4px;
  opacity: 0.7;
  line-height: 1;
}

.WorkloadTopology__metricsHintClose:hover {
  opacity: 1;
}

.IssuePanel {
  margin: 10px 18px 0;
}

.IssuePanel__header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
}

.IssuePanel__title {
  font-size: 11px;
  font-weight: 700;
  color: var(--textColorSecondary);
  text-transform: uppercase;
  letter-spacing: 0.03em;
}

.IssuePanel__count {
  font-size: 10px;
  font-weight: 700;
  color: #d44848;
  background: rgba(212, 72, 72, 0.12);
  padding: 1px 7px;
  border-radius: 8px;
  line-height: 16px;
}

.IssuePanel__toggle {
  margin-left: auto;
  padding: 0;
  border: none;
  background: none;
  color: var(--textColorSecondary);
  font-size: 11px;
  cursor: pointer;
  opacity: 0.7;
  transition: opacity 0.15s;
}

.IssuePanel__toggle:hover {
  opacity: 1;
  color: #7fb4ff;
}

.IssuePanel__grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
  gap: 6px;
  max-height: 198px;
  overflow-y: auto;
}

.IssuePanel__card {
  display: flex;
  flex-direction: column;
  gap: 3px;
  padding: 8px 10px;
  text-align: left;
  background: var(--contentColor);
  border: 1px solid var(--borderColor);
  border-radius: 6px;
  cursor: pointer;
  transition: border-color 0.15s, box-shadow 0.15s;
}

.IssuePanel__card:hover {
  border-color: rgba(127, 180, 255, 0.4);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
}

.IssuePanel__cardTop {
  display: flex;
  align-items: center;
  gap: 6px;
}

.IssuePanel__dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  flex-shrink: 0;
}

.IssuePanel__dot.is-danger {
  background: #d44848;
  box-shadow: 0 0 6px rgba(212, 72, 72, 0.4);
}

.IssuePanel__dot.is-warning {
  background: #d99b20;
  box-shadow: 0 0 6px rgba(217, 155, 32, 0.3);
}

.IssuePanel__cardKind {
  font-size: 10px;
  font-weight: 700;
  color: var(--textColorSecondary);
  text-transform: uppercase;
}

.IssuePanel__cardName {
  font-size: 12px;
  font-weight: 600;
  color: var(--textColorPrimary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.IssuePanel__cardMsg {
  font-size: 11px;
  font-style: normal;
  color: var(--textColorSecondary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  opacity: 0.75;
}

.WorkloadTopology__body {
  display: flex;
  min-height: 0;
  flex: 1;
}

.TopologyCanvas {
  position: relative;
  flex: 1;
  overflow: hidden;
  margin: 14px 18px 18px;
  background:
    linear-gradient(var(--borderColor) 1px, transparent 1px),
    linear-gradient(90deg, var(--borderColor) 1px, transparent 1px),
    var(--contentColor);
  background-size: 28px 28px;
  border: 1px solid var(--borderColor);
  border-radius: 6px;
  cursor: grab;
}

.TopologyCanvas--plain {
  background: var(--contentColor);
}

.TopologyCanvas:active {
  cursor: grabbing;
}

.TopologyCanvas__gridToggle {
  position: absolute;
  top: 12px;
  right: 12px;
  z-index: 4;
  height: 28px;
  padding: 0 10px;
  color: var(--textColorPrimary);
  background: rgba(22, 28, 34, 0.9);
  border: 1px solid var(--borderColor);
  border-radius: 4px;
  cursor: pointer;
  font-size: 12px;
}

.TopologyCanvas__gridToggle.is-active {
  color: #7fb4ff;
  border-color: #7fb4ff;
  background: rgba(127, 180, 255, 0.14);
  font-weight: 600;
}

.TopologyCanvas__content {
  position: relative;
  width: 1300px;
  min-height: 640px;
  transform-origin: 0 0;
}

.TopologyCanvas__edges {
  position: absolute;
  inset: 0;
  overflow: visible;
  pointer-events: none;
}

.TopologyCanvas__edges path {
  fill: none;
  stroke: #6f879d;
  stroke-width: 2;
  stroke-linecap: round;
  opacity: 0.8;
}

.TopologyCanvas__edges path.relation-dimmed {
  opacity: 0.12;
}

.TopologyCanvas__edges path.relation-connected {
  stroke: #7fb4ff;
  stroke-width: 3;
  opacity: 0.95;
}

.TopologyCanvas__edges path.relation-blast {
  stroke-width: 3;
  opacity: 0.9;
  stroke-dasharray: 6 3;
}

.TopologyCanvas__edges path.relation-blast.is-danger {
  stroke: #d44848;
}

.TopologyCanvas__edges path.relation-blast.is-warning {
  stroke: #d99b20;
}

.TopologyCanvas__marquee {
  position: absolute;
  background: rgba(75, 123, 236, 0.12);
  border: 1px dashed rgba(75, 123, 236, 0.6);
  border-radius: 3px;
  pointer-events: none;
  z-index: 5;
}

.TopologyCanvas__columns {
  position: absolute;
  inset: 20px 0 auto;
}

.TopologyCanvas__columns--zone {
  inset: auto;
}

.TopologyCanvas__columns span {
  position: absolute;
  width: 190px;
  color: var(--textColorSecondary);
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0;
  text-transform: uppercase;
  text-align: center;
}

.TopologyCanvas__zoneSeparator {
  position: absolute;
  left: 30px;
  right: 30px;
  height: 1px;
  background: linear-gradient(90deg, transparent, var(--borderColor) 60px, var(--borderColor) calc(100% - 60px), transparent);
}

.TopologyCanvas__zoneSeparator span {
  position: absolute;
  left: 0;
  top: -9px;
  padding: 0 10px 0 0;
  color: var(--textColorSecondary);
  background: var(--contentColor);
  font-size: 11px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.TopologyZoomControls {
  position: absolute;
  right: 14px;
  bottom: 156px;
  width: 210px;
  box-sizing: border-box;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 6px 10px;
  background: rgba(22, 28, 34, 0.9);
  border: 1px solid var(--borderColor);
  border-radius: 6px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.2);
  z-index: 3;
}

.TopologyZoomControls span {
  width: 40px;
  text-align: center;
  color: var(--textColorPrimary);
  font-size: 11px;
  font-weight: 600;
}

.TopologyZoomControls button {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  padding: 0;
  color: var(--textColorPrimary);
  background: var(--contentColor);
  border: 1px solid var(--borderColor);
  border-radius: 4px;
  cursor: pointer;
  font-size: 14px;
  line-height: 1;
}

.TopologyZoomControls button:hover {
  background: rgba(127, 180, 255, 0.15);
  border-color: #7fb4ff;
  color: #7fb4ff;
}

.TopologyMinimap {
  position: absolute;
  right: 14px;
  bottom: 14px;
  overflow: hidden;
  background: rgba(22, 28, 34, 0.9);
  border: 1px solid var(--borderColor);
  border-radius: 6px;
  box-shadow: 0 10px 24px rgba(0, 0, 0, 0.28);
  cursor: pointer;
  z-index: 3;
}

.TopologyMinimap svg {
  display: block;
}

.TopologyMinimap rect {
  fill: #607d8b;
  opacity: 0.9;
}

.TopologyMinimap rect.status-healthy {
  fill: #31a66a;
}

.TopologyMinimap rect.status-warning {
  fill: #d99b20;
}

.TopologyMinimap rect.status-danger {
  fill: #d44848;
}

.TopologyMinimap__viewport {
  position: absolute;
  border: 2px solid #7fb4ff;
  background: rgba(127, 180, 255, 0.12);
  box-sizing: border-box;
  cursor: grab;
  touch-action: none;
}

.TopologyMinimap__viewport:active {
  cursor: grabbing;
}

.TopologyCard {
  position: absolute;
  box-sizing: border-box;
  width: 190px;
  height: 136px;
  padding: 10px 12px 10px 10px;
  color: var(--textColorPrimary);
  text-align: left;
  background: var(--layoutBackground);
  border: 1px solid var(--borderColor);
  border-radius: 6px;
  box-shadow: 0 8px 20px rgba(0, 0, 0, 0.22);
  cursor: grab;
}

.TopologyCard:active {
  cursor: grabbing;
}

.TopologyCard::after {
  position: absolute;
  top: 50%;
  right: -6px;
  width: 10px;
  height: 10px;
  content: "";
  background: var(--layoutBackground);
  border-top: 1px solid var(--borderColor);
  border-right: 1px solid var(--borderColor);
  transform: translateY(-50%) rotate(45deg);
}

.TopologyCard.status-healthy {
  border-color: #31a66a;
}

.TopologyCard.status-warning {
  border-color: #d99b20;
}

.TopologyCard.status-danger {
  border-color: #d44848;
}

.TopologyCard.is-selected {
  z-index: 2;
  outline: 2px solid #4b7bec;
  outline-offset: 2px;
}

.TopologyCard.relation-dimmed {
  opacity: 0.28;
}

.TopologyCard.relation-connected {
  box-shadow: 0 0 0 2px rgba(127, 180, 255, 0.35), 0 8px 20px rgba(0, 0, 0, 0.22);
}

.TopologyCard.blast-danger {
  box-shadow: 0 0 0 2px rgba(212, 72, 72, 0.4), 0 0 12px rgba(212, 72, 72, 0.15);
}

.TopologyCard.blast-warning {
  box-shadow: 0 0 0 2px rgba(217, 155, 32, 0.35), 0 0 12px rgba(217, 155, 32, 0.12);
}

.TopologyCard__header {
  display: flex;
  align-items: center;
  gap: 7px;
  min-width: 0;
}

.TopologyCard__icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  flex-shrink: 0;
  color: var(--textColorPrimary);
  opacity: 0.85;
}

.TopologyCard.kind-LoadBalancer .TopologyCard__icon { color: #e67e22; }
.TopologyCard.kind-Ingress .TopologyCard__icon { color: #4b7bec; }
.TopologyCard.kind-Service .TopologyCard__icon { color: #26a69a; }
.TopologyCard.kind-Deployment .TopologyCard__icon { color: #7e57c2; }
.TopologyCard.kind-CronJobs .TopologyCard__icon,
.TopologyCard.kind-CronJob .TopologyCard__icon { color: #8d6e63; }
.TopologyCard.kind-Jobs .TopologyCard__icon,
.TopologyCard.kind-Job .TopologyCard__icon { color: #5c6bc0; }
.TopologyCard.kind-Pod .TopologyCard__icon,
.TopologyCard.kind-Pods .TopologyCard__icon { color: #43a047; }
.TopologyCard.kind-ConfigMap .TopologyCard__icon { color: #78909c; }
.TopologyCard.kind-Secret .TopologyCard__icon { color: #ef6c00; }

.TopologyCard__kind {
  overflow: hidden;
  color: var(--textColorSecondary);
  font-size: 11px;
  font-weight: 700;
  text-overflow: ellipsis;
  text-transform: uppercase;
  white-space: nowrap;
}

.TopologyCard__age {
  margin-left: auto;
  font-size: 10px;
  color: var(--textColorSecondary);
  opacity: 0.7;
  font-weight: 400;
  white-space: nowrap;
}

.TopologyCard__name {
  overflow: hidden;
  margin-top: 6px;
  font-size: 13px;
  font-weight: 600;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.TopologyCard__meta {
  overflow: hidden;
  margin-top: 4px;
  color: var(--textColorSecondary);
  font-size: 11px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.TopologyCard__status {
  overflow: hidden;
  margin-top: 4px;
  color: var(--textColorSecondary);
  font-size: 11px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.TopologyCard__problem {
  overflow: hidden;
  margin-top: 6px;
  padding-top: 6px;
  border-top: 1px solid var(--borderColor);
  font-size: 11px;
  font-weight: 600;
  line-height: 1.25;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.TopologyCard__problem.is-warning {
  color: #d99b20;
}

.TopologyCard__problem.is-danger {
  color: #d44848;
}

.TopologyCard__tooltip {
  position: absolute;
  top: 100%;
  left: 50%;
  transform: translateX(-50%);
  margin-top: 8px;
  padding: 8px 10px;
  min-width: 170px;
  max-width: 260px;
  background: rgba(22, 28, 36, 0.95);
  border: 1px solid rgba(127, 180, 255, 0.15);
  border-radius: 6px;
  box-shadow: 0 6px 20px rgba(0, 0, 0, 0.35);
  z-index: 10;
  pointer-events: none;
  animation: tooltipFadeIn 0.15s ease-out;
}

@keyframes tooltipFadeIn {
  from { opacity: 0; transform: translateX(-50%) translateY(4px); }
  to { opacity: 1; transform: translateX(-50%) translateY(0); }
}

.TopologyCard__tooltip::before {
  content: "";
  position: absolute;
  top: -4px;
  left: 50%;
  transform: translateX(-50%) rotate(45deg);
  width: 7px;
  height: 7px;
  background: rgba(22, 28, 36, 0.95);
  border-top: 1px solid rgba(127, 180, 255, 0.15);
  border-left: 1px solid rgba(127, 180, 255, 0.15);
}

.TopologyCard__tooltipRow {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
  padding: 2px 0;
}

.TopologyCard__tooltipRow span {
  font-size: 10px;
  color: var(--textColorSecondary);
  text-transform: none;
  font-weight: 400;
  flex-shrink: 0;
}

.TopologyCard__tooltipRow strong {
  font-size: 11px;
  font-weight: 600;
  color: var(--textColorPrimary);
  text-align: right;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.TopologyCard__tooltip.is-wide {
  min-width: 320px;
  max-width: 420px;
}

.TopologyCard__tooltipSep {
  height: 1px;
  margin: 5px 0;
  background: rgba(255, 255, 255, 0.08);
}

.TopologyCard__tooltipTable {
  width: 100%;
  border-collapse: collapse;
  font-size: 10px;
}

.TopologyCard__tooltipTable th {
  text-align: left;
  font-weight: 600;
  color: var(--textColorSecondary);
  padding: 2px 4px 3px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.06);
  white-space: nowrap;
}

.TopologyCard__tooltipTable th:nth-child(n+2) {
  text-align: right;
}

.TopologyCard__tooltipTable td {
  padding: 2px 4px;
  color: var(--textColorPrimary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 160px;
}

.TopologyCard__tooltipTable td:nth-child(n+2) {
  text-align: right;
  color: var(--textColorSecondary);
}

.TopologyCard__tooltipTable tr.is-warn td:first-child {
  color: #d99b20;
}

.TopologyCard__tooltipMore {
  text-align: center;
  font-size: 10px;
  color: var(--textColorSecondary);
  padding: 3px 0 0;
}

.StatusToasts {
  position: fixed;
  bottom: 20px;
  left: 50%;
  transform: translateX(-50%);
  display: flex;
  flex-direction: column;
  gap: 6px;
  z-index: 1000;
  pointer-events: none;
}

.StatusToast {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 14px;
  background: rgba(22, 28, 36, 0.92);
  border: 1px solid var(--borderColor);
  border-radius: 8px;
  box-shadow: 0 6px 20px rgba(0, 0, 0, 0.3);
  animation: toastSlideIn 0.25s ease-out;
  white-space: nowrap;
}

@keyframes toastSlideIn {
  from { opacity: 0; transform: translateY(10px); }
  to { opacity: 1; transform: translateY(0); }
}

.StatusToast__dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  flex-shrink: 0;
}

.StatusToast__dot.is-healthy { background: #31a66a; box-shadow: 0 0 6px rgba(49, 166, 106, 0.4); }
.StatusToast__dot.is-danger { background: #d44848; box-shadow: 0 0 6px rgba(212, 72, 72, 0.4); }
.StatusToast__dot.is-warning { background: #d99b20; box-shadow: 0 0 6px rgba(217, 155, 32, 0.3); }
.StatusToast__dot.is-unknown { background: #607d8b; }

.StatusToast strong {
  font-size: 12px;
  font-weight: 600;
  color: var(--textColorPrimary);
}

.StatusToast__change {
  font-size: 11px;
  color: var(--textColorSecondary);
}

.StatusToast.is-danger { border-color: rgba(212, 72, 72, 0.3); }
.StatusToast.is-warning { border-color: rgba(217, 155, 32, 0.2); }
.StatusToast.is-healthy { border-color: rgba(49, 166, 106, 0.3); }

.TopologyDetails {
  position: relative;
  display: flex;
  flex-direction: column;
  flex-shrink: 0;
  margin: 14px 18px 18px 0;
  background: var(--contentColor);
  border: 1px solid var(--borderColor);
  border-radius: 6px;
  overflow: hidden;
}

.TopologyDetails__resize {
  position: absolute;
  top: 0;
  left: 0;
  bottom: 0;
  width: 5px;
  cursor: col-resize;
  z-index: 4;
}

.TopologyDetails__resize:hover,
.TopologyDetails__resize:active {
  background: rgba(127, 180, 255, 0.3);
}

.TopologyDetails--empty {
  align-items: center;
  justify-content: center;
}

.TopologyDetails__empty {
  padding: 20px;
  color: var(--textColorSecondary);
  font-size: 13px;
  text-align: center;
}

.TopologyDetails__header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  padding: 14px;
  border-bottom: 1px solid var(--borderColor);
}

.TopologyDetails__header span {
  color: var(--textColorSecondary);
  font-size: 11px;
  font-weight: 700;
  text-transform: uppercase;
}

.TopologyDetails__header h3 {
  margin: 5px 0 0;
  font-size: 16px;
  font-weight: 600;
  word-break: break-all;
}

.TopologyDetails__close {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  flex-shrink: 0;
  padding: 0;
  color: var(--textColorSecondary);
  background: transparent;
  border: 1px solid transparent;
  border-radius: 4px;
  cursor: pointer;
  font-size: 20px;
  line-height: 1;
}

.TopologyDetails__close:hover {
  color: var(--textColorPrimary);
  background: var(--layoutBackground);
  border-color: var(--borderColor);
}

.TopologyDetails button,
.TopologyDetails__actions button {
  height: 28px;
  padding: 0 9px;
  color: var(--textColorPrimary);
  background: var(--layoutBackground);
  border: 1px solid var(--borderColor);
  border-radius: 4px;
  cursor: pointer;
}

.TopologyDetails button:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}

.TopologyDetails__info {
  padding: 6px 0 8px;
  border-bottom: 1px solid var(--borderColor);
}

.TopologyDetails__copied {
  margin: 10px 14px 0;
  color: #31a66a;
  font-size: 12px;
}

.TopologyDetails__applied {
  margin: 10px 14px 0;
  color: #31a66a;
  font-size: 12px;
}

.TopologyDetails__applyError {
  margin: 10px 14px 0;
  color: var(--colorError);
  font-size: 12px;
  line-height: 1.4;
}

.TopologyDetails__warnings {
  margin: 10px 14px 0;
  padding: 8px 10px;
  color: #d99b20;
  background: rgba(217, 155, 32, 0.12);
  border: 1px solid rgba(217, 155, 32, 0.35);
  border-radius: 4px;
  font-size: 12px;
  line-height: 1.4;
}

.TopologyDetails__sectionTitle {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 8px;
  color: var(--textColorSecondary);
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0;
  text-transform: uppercase;
}

.TopologyDetails__sectionTitle span {
  color: var(--textColorSecondary);
  font-weight: 600;
}

.TopologyDetails__problems {
  margin: 10px 14px 0;
  padding: 10px;
  background: rgba(212, 72, 72, 0.08);
  border: 1px solid rgba(212, 72, 72, 0.25);
  border-radius: 4px;
}

.TopologyDetails__problem {
  font-size: 12px;
  line-height: 1.4;
}

.TopologyDetails__problem + .TopologyDetails__problem {
  margin-top: 6px;
}

.TopologyDetails__problem.is-warning {
  color: #d99b20;
}

.TopologyDetails__problem.is-danger {
  color: #d44848;
}

.TopologyDetails__causeHints {
  margin: 10px 14px 0;
  padding: 10px;
  background: rgba(127, 180, 255, 0.08);
  border: 1px solid rgba(127, 180, 255, 0.25);
  border-radius: 4px;
}

.TopologyDetails__causeHint {
  display: grid;
  grid-template-columns: 96px minmax(0, 1fr);
  gap: 8px;
  font-size: 12px;
  line-height: 1.4;
}

.TopologyDetails__causeHint + .TopologyDetails__causeHint {
  margin-top: 7px;
}

.TopologyDetails__causeHint strong {
  overflow: hidden;
  color: #7fb4ff;
  font-weight: 700;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.TopologyDetails__causeHint span {
  color: var(--textColorPrimary);
}

.TopologyDetails__events {
  padding: 10px 14px;
  overflow: auto;
  border-bottom: 1px solid var(--borderColor);
}

.TopologyDetails__events--preview {
  max-height: none;
  border-bottom: 0;
}

.TopologyDetails__events--full {
  flex: 1;
  min-height: 0;
}

.TopologyDetails__eventEmpty {
  color: var(--textColorSecondary);
  font-size: 12px;
}

.TopologyDetails__event {
  padding: 8px 0;
  border-top: 1px solid var(--borderColor);
}

.TopologyDetails__event:first-of-type {
  border-top: 0;
}

.TopologyDetails__event.is-warning strong {
  color: #d99b20;
}

.TopologyDetails__eventHeader {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 8px;
  min-width: 0;
}

.TopologyDetails__eventHeader strong {
  overflow: hidden;
  font-size: 12px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.TopologyDetails__eventHeader span {
  flex-shrink: 0;
  color: var(--textColorSecondary);
  font-size: 11px;
}

.TopologyDetails__event p {
  margin: 5px 0 0;
  color: var(--textColorPrimary);
  font-size: 12px;
  line-height: 1.35;
}

.TopologyDetails__event small {
  display: block;
  margin-top: 4px;
  color: var(--textColorSecondary);
  font-size: 11px;
}

.TopologyDetails__eventMore {
  padding: 8px 0 0;
  color: var(--textColorSecondary);
  font-size: 12px;
}

.TopologyDetails__row {
  display: grid;
  grid-template-columns: 96px minmax(0, 1fr);
  gap: 10px;
  padding: 10px 14px 0;
  font-size: 12px;
}

.TopologyDetails__row.is-copyable {
  cursor: pointer;
  border-radius: 4px;
}

.TopologyDetails__row.is-copyable strong {
  text-decoration: underline;
  text-decoration-color: rgba(127, 180, 255, 0.3);
  text-underline-offset: 2px;
}

.TopologyDetails__row.is-copyable:hover {
  background: rgba(127, 180, 255, 0.08);
}

.TopologyDetails__row.is-copyable:hover strong {
  color: #7fb4ff;
  text-decoration-color: #7fb4ff;
}

.TopologyDetails__copyIcon {
  margin-left: 5px;
  color: var(--textColorSecondary);
  font-size: 11px;
  opacity: 0.4;
}

.TopologyDetails__row.is-copyable:hover .TopologyDetails__copyIcon {
  color: #7fb4ff;
  opacity: 0.8;
}

.TopologyDetails__row--action {
  cursor: pointer;
}

.TopologyDetails__row--action strong {
  color: #7fb4ff;
  text-decoration: underline;
  text-decoration-color: rgba(127, 180, 255, 0.35);
  text-underline-offset: 2px;
}

.TopologyDetails__row--action:hover {
  background: rgba(127, 180, 255, 0.08);
}

.TopologyDetails__row span {
  color: var(--textColorSecondary);
}

.TopologyDetails__row strong {
  overflow: hidden;
  font-weight: 600;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.TopologyDetails__json {
  flex: 1;
  min-height: 180px;
  margin: 14px;
  padding: 10px;
  overflow: auto;
  color: var(--textColorPrimary);
  background: var(--layoutBackground);
  border: 1px solid var(--borderColor);
  border-radius: 4px;
  font-size: 11px;
  line-height: 1.45;
  white-space: pre;
}

.TopologyDetails__jsonView {
  display: flex;
  flex-direction: column;
  min-height: 0;
  flex: 1;
}

.TopologyDetails__inspect {
  flex: 1;
  min-height: 0;
  overflow: auto;
  padding-bottom: 12px;
}

.TopologyDetails__inspect .TopologyDetails__problems,
.TopologyDetails__inspect .TopologyDetails__causeHints {
  margin-top: 12px;
}

.TopologyDetails__summary {
  margin: 12px 14px 0;
}

.TopologyDetails__summaryButton {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  height: 36px;
  padding: 0 14px;
  color: #7fb4ff;
  background: rgba(127, 180, 255, 0.08);
  border: 1px solid rgba(127, 180, 255, 0.3);
  border-radius: 6px;
  cursor: pointer;
  font-size: 13px;
  font-weight: 600;
  transition: all 0.2s ease;
}

.TopologyDetails__summaryButton span {
  color: rgba(127, 180, 255, 0.8);
  font-size: 11px;
  font-weight: 600;
  background: rgba(127, 180, 255, 0.15);
  padding: 3px 8px;
  border-radius: 12px;
}

.TopologyDetails__summaryButton:hover {
  background: rgba(127, 180, 255, 0.15);
  border-color: rgba(127, 180, 255, 0.5);
  color: #9ac2ff;
}

.TopologyDetails__jsonSearch {
  height: 30px;
  margin: 10px 14px 0;
  padding: 0 10px;
  color: var(--textColorPrimary);
  background: var(--layoutBackground);
  border: 1px solid var(--borderColor);
  border-radius: 4px;
  outline: none;
}

.TopologyDetails__jsonSearch:focus {
  border-color: #4b7bec;
}

.JsonTree__header {
  display: flex;
  align-items: center;
}

.JsonTree__header--root {
  justify-content: space-between;
}

.JsonTree__rootActions {
  display: inline-flex;
  gap: 4px;
  flex-shrink: 0;
}

.JsonTree__rootActions button {
  height: 20px;
  padding: 0 6px;
  color: var(--textColorSecondary);
  background: transparent;
  border: 1px solid var(--borderColor);
  border-radius: 3px;
  cursor: pointer;
  font-size: 10px;
  white-space: nowrap;
}

.JsonTree__rootActions button:hover {
  color: var(--textColorPrimary);
  border-color: #4b7bec;
}

.TopologyDetails__jsonTree {
  flex: 1;
  min-height: 220px;
  margin: 10px 14px 14px;
  padding: 8px;
  overflow: auto;
  background: var(--layoutBackground);
  border: 1px solid var(--borderColor);
  border-radius: 4px;
  font-family: var(--font-monospace);
  font-size: 11px;
  line-height: 1.45;
}

.JsonTree__toggle {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  max-width: 100%;
  height: 24px;
  padding: 0 4px;
  color: var(--textColorPrimary);
  background: transparent;
  border: 0;
  border-radius: 3px;
  cursor: pointer;
}

.JsonTree__toggle:hover {
  background: rgba(127, 180, 255, 0.08);
}

.JsonTree__arrow {
  display: inline-block;
  width: 12px;
  flex-shrink: 0;
  color: var(--textColorSecondary);
  font-size: 10px;
  text-align: center;
}

.JsonTree__toggle strong {
  color: #7fb4ff;
  font-weight: 600;
}

.JsonTree__toggle em {
  color: var(--textColorSecondary);
  font-size: 10px;
  font-style: normal;
}

.JsonTree__preview {
  overflow: hidden;
  max-width: 180px;
  color: var(--textColorSecondary);
  font-size: 10px;
  text-overflow: ellipsis;
  white-space: nowrap;
  opacity: 0.7;
}

.JsonTree__children {
  margin-left: 12px;
  padding-left: 14px;
  border-left: 1px solid rgba(127, 180, 255, 0.15);
}

.JsonTree__children.is-array > .JsonTree {
  padding-top: 2px;
}

.JsonTree__separator {
  height: 1px;
  margin: 4px 0;
  background: rgba(127, 180, 255, 0.1);
}

.JsonTree__row {
  min-height: 24px;
  padding: 2px 6px;
  border-radius: 3px;
  cursor: pointer;
  white-space: pre-wrap;
  word-break: break-word;
}

.JsonTree__row:hover {
  background: rgba(127, 180, 255, 0.08);
}

.JsonTree__key {
  color: #7fb4ff;
  font-weight: 600;
}

.JsonTree__colon {
  color: var(--textColorSecondary);
}

.JsonTree__value.value-string {
  color: #72c98f;
}

.JsonTree__value.value-number {
  color: #d7aa5f;
}

.JsonTree__value.value-boolean {
  color: #c792ea;
}

.JsonTree__value.value-null {
  color: #9aa7b3;
  font-style: italic;
}

.JsonTree.is-match > .JsonTree__toggle,
.JsonTree__row.is-match {
  background: rgba(127, 180, 255, 0.14);
  border-radius: 3px;
}

.JsonMeaningModal__backdrop {
  position: fixed;
  inset: 0;
  z-index: 1001;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
  background: rgba(0, 0, 0, 0.48);
}

.JsonMeaningModal {
  display: flex;
  flex-direction: column;
  width: min(920px, calc(100vw - 48px));
  max-height: min(720px, calc(100vh - 48px));
  color: var(--textColorPrimary);
  background: var(--contentColor);
  border: 1px solid var(--borderColor);
  border-radius: 6px;
  box-shadow: 0 18px 54px rgba(0, 0, 0, 0.45);
  overflow: hidden;
}

.JsonMeaningModal__header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  padding: 14px 16px;
  border-bottom: 1px solid var(--borderColor);
}

.JsonMeaningModal__header span {
  color: var(--textColorSecondary);
  font-size: 11px;
  font-weight: 700;
  text-transform: uppercase;
}

.JsonMeaningModal__header h3 {
  margin: 5px 0 0;
  font-size: 16px;
  font-weight: 600;
}

.JsonMeaningModal__header button {
  width: 30px;
  height: 30px;
  color: var(--textColorSecondary);
  background: transparent;
  border: 1px solid transparent;
  border-radius: 4px;
  cursor: pointer;
  font-size: 22px;
  line-height: 1;
}

.JsonMeaningModal__header button:hover {
  color: var(--textColorPrimary);
  background: var(--layoutBackground);
  border-color: var(--borderColor);
}

.JsonMeaningModal__table {
  overflow: auto;
  padding: 0 16px 16px;
}

.JsonMeaningModal__head,
.JsonMeaningModal__row {
  display: grid;
  grid-template-columns: 1fr 1.25fr 1.25fr;
  gap: 16px;
  align-items: start;
  min-width: 680px;
}

.JsonMeaningModal__head {
  position: sticky;
  top: 0;
  z-index: 1;
  padding: 16px 12px 8px;
  color: var(--textColorSecondary);
  background: var(--contentColor);
  border-bottom: 2px solid var(--borderColor);
  font-size: 12px;
  align-items: end;
  font-weight: 700;
}

.JsonMeaningModal__row {
  padding: 12px;
  border-bottom: 1px solid var(--borderColor);
  font-size: 13px;
  transition: background 0.15s ease;
}

.JsonMeaningModal__row:hover {
  background: rgba(127, 180, 255, 0.05);
  border-radius: 4px;
}

.JsonMeaningModal__row code {
  color: #7fb4ff;
  background: rgba(127, 180, 255, 0.1);
  padding: 2px 6px;
  border-radius: 4px;
  font-family: var(--font-monospace);
  word-break: break-all;
  line-height: 1.5;
}

.JsonMeaningModal__value {
  color: #e2e8f0;
  font-weight: 500;
  word-break: break-all;
  white-space: pre-wrap;
  line-height: 1.5;
  padding: 2px 4px;
  margin: -2px -4px;
  border-radius: 4px;
  transition: background 0.15s ease;
}

.JsonMeaningModal__value.is-expandable {
  cursor: pointer;
  display: -webkit-box;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 4;
  overflow: hidden;
}

.JsonMeaningModal__value.is-expandable:hover {
  background: rgba(127, 180, 255, 0.1);
}

.JsonMeaningModal__value.is-expandable.is-expanded {
  display: block;
  -webkit-line-clamp: unset;
  overflow: visible;
}

.JsonMeaningModal__row span {
  color: #94a3b8;
  line-height: 1.5;
  word-break: keep-all;
}

.TopologyDetails__tabs {
  display: flex;
  gap: 6px;
  padding: 12px 14px 8px;
  border-bottom: 1px solid var(--borderColor);
}

.TopologyDetails__tabs button {
  flex: 1;
  min-width: 0;
}

.TopologyDetails__tabs button.is-active {
  border-color: #4b7bec;
}

.TopologyDetails__yamlView {
  display: flex;
  flex: 1;
  min-height: 0;
  flex-direction: column;
}

.CodeEditor {
  display: grid;
  grid-template-columns: 42px minmax(0, 1fr);
  flex: 1;
  min-height: 260px;
  margin: 14px 14px 10px;
  overflow: hidden;
  background: var(--layoutBackground);
  border: 1px solid var(--borderColor);
  border-radius: 4px;
}

.CodeEditor__lines {
  padding: 10px 8px 10px 0;
  overflow: hidden;
  color: var(--textColorSecondary);
  background: rgba(0, 0, 0, 0.08);
  border-right: 1px solid var(--borderColor);
  font-family: var(--font-monospace);
  font-size: 11px;
  line-height: 1.45;
  text-align: right;
  user-select: none;
}

.CodeEditor__lines span {
  display: block;
  height: 15.95px;
}

.CodeEditor__body {
  position: relative;
  overflow: hidden;
  min-height: 260px;
}

.CodeEditor__highlight,
.TopologyDetails__yaml {
  position: absolute;
  inset: 0;
  box-sizing: border-box;
  width: 100%;
  height: 100%;
  min-height: 260px;
  margin: 0;
  padding: 10px;
  border: 0;
  font-family: var(--font-monospace);
  font-size: 11px;
  font-weight: 400;
  line-height: 16px;
  letter-spacing: 0;
  white-space: pre;
  word-break: keep-all;
  overflow-wrap: normal;
  tab-size: 2;
  font-variant-ligatures: none;
  -webkit-appearance: none;
  appearance: none;
}

.CodeEditor__highlight {
  color: var(--textColorPrimary);
  background: transparent;
  pointer-events: none;
  overflow: hidden;
}

.CodeEditor__highlight code {
  font: inherit;
}

.TopologyDetails__yaml {
  color: transparent;
  caret-color: var(--textColorPrimary);
  background: transparent;
  resize: none;
  outline: none;
  z-index: 1;
}

.TopologyDetails__yaml::selection {
  background: rgba(127, 180, 255, 0.3);
  color: transparent;
}

.CodeEditor:focus-within {
  border-color: #4b7bec;
}

.yaml-key {
  color: #7fb4ff;
}

.yaml-colon {
  color: var(--textColorSecondary);
}

.yaml-string {
  color: #72c98f;
}

.yaml-number {
  color: #d7aa5f;
}

.yaml-boolean {
  color: #c792ea;
}

.yaml-comment {
  color: #6a7a8a;
  font-style: italic;
}

.yaml-dash {
  color: #e06c75;
}

.TopologyDetails__applyActions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  padding: 0 14px 14px;
}

.TopologyDetails__diff {
  max-height: 150px;
  margin: 0 14px 10px;
  padding: 10px;
  overflow: auto;
  color: var(--textColorPrimary);
  background: var(--layoutBackground);
  border: 1px solid var(--borderColor);
  border-radius: 4px;
  font-size: 11px;
  line-height: 1.45;
}

.TopologyDetails__diff div {
  display: grid;
  grid-template-columns: 34px minmax(0, 1fr);
  gap: 8px;
}

.TopologyDetails__diff span {
  color: var(--textColorSecondary);
  text-align: right;
  user-select: none;
}

.TopologyDetails__diff code {
  white-space: pre-wrap;
}

.TopologyDetails__diff .diff-added {
  color: #72c98f;
}

.TopologyDetails__diff .diff-removed {
  color: #d44848;
}

.TopologyDetails__json .json-key {
  color: #7fb4ff;
}

.TopologyDetails__json .json-string {
  color: #72c98f;
}

.TopologyDetails__json .json-number {
  color: #d7aa5f;
}

.TopologyDetails__json .json-boolean {
  color: #c792ea;
}

.TopologyDetails__json .json-null {
  color: #9aa7b3;
  font-style: italic;
}

.PodLogsModal__backdrop {
  position: fixed;
  inset: 0;
  z-index: 1000;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 16px;
  background: rgba(0, 0, 0, 0.48);
}

.PodLogsModal {
  display: flex;
  flex-direction: column;
  width: min(1480px, calc(100vw - 32px));
  height: min(900px, calc(100vh - 32px));
  color: var(--textColorPrimary);
  background: var(--contentColor);
  border: 1px solid var(--borderColor);
  border-radius: 6px;
  box-shadow: 0 18px 54px rgba(0, 0, 0, 0.45);
  overflow: hidden;
}

.PodLogsModal.is-fullscreen {
  width: 100vw;
  height: 100vh;
  border-radius: 0;
  border: none;
}

.PodLogsModal__header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  padding: 14px 16px;
  border-bottom: 1px solid var(--borderColor);
}

.PodLogsModal__header span {
  color: var(--textColorSecondary);
  font-size: 11px;
  font-weight: 700;
  text-transform: uppercase;
}

.PodLogsModal__header h3 {
  margin: 5px 0 0;
  font-size: 16px;
  font-weight: 600;
  word-break: break-all;
}

.PodLogsModal__headerActions {
  display: flex;
  align-items: center;
  gap: 4px;
  flex-shrink: 0;
}

.PodLogsModal__header button {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 30px;
  height: 30px;
  flex-shrink: 0;
  color: var(--textColorSecondary);
  background: transparent;
  border: 1px solid transparent;
  border-radius: 4px;
  cursor: pointer;
  font-size: 22px;
  line-height: 1;
}

.PodLogsModal__header button:hover {
  color: var(--textColorPrimary);
  background: var(--layoutBackground);
  border-color: var(--borderColor);
}

.PodLogsModal__toolbar {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
  padding: 10px 16px;
  border-bottom: 1px solid var(--borderColor);
}

.PodLogsModal__toolbar label {
  display: flex;
  align-items: center;
  gap: 6px;
  color: var(--textColorSecondary);
  font-size: 12px;
}

.PodLogsModal__podFilter,
.PodLogsModal__hiddenFilter,
.PodLogsModal__severityFilter {
  position: relative;
  display: flex;
  align-items: center;
  gap: 6px;
  color: var(--textColorSecondary);
  font-size: 12px;
}

.PodLogsModal__podFilter > button,
.PodLogsModal__hiddenFilter > button,
.PodLogsModal__severityFilter > button {
  max-width: 190px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.PodLogsModal__podMenu,
.PodLogsModal__hiddenMenu,
.PodLogsModal__severityMenu {
  position: absolute;
  top: 34px;
  left: 28px;
  z-index: 2;
  width: 260px;
  max-height: 280px;
  padding: 6px;
  overflow: auto;
  color: var(--textColorPrimary);
  background: var(--contentColor);
  border: 1px solid var(--borderColor);
  border-radius: 4px;
  box-shadow: 0 10px 24px rgba(0, 0, 0, 0.32);
}

.PodLogsModal__hiddenMenu {
  left: 44px;
  width: 360px;
}

.PodLogsModal__hiddenActions {
  display: flex;
  justify-content: flex-end;
  padding: 4px 4px 6px;
  border-bottom: 1px solid var(--borderColor);
  margin-bottom: 4px;
}

.PodLogsModal__hiddenItem {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 26px;
  gap: 8px;
  align-items: center;
  padding: 6px 7px;
  border-radius: 3px;
}

.PodLogsModal__hiddenItem:hover {
  background: rgba(127, 180, 255, 0.08);
}

.PodLogsModal__hiddenItem span {
  overflow: hidden;
  color: var(--textColorPrimary);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.PodLogsModal__hiddenItem button {
  width: 24px;
  min-width: 24px;
  padding: 0;
}

.PodLogsModal__podMenu label,
.PodLogsModal__severityMenu label {
  display: grid;
  grid-template-columns: 20px minmax(0, 1fr);
  gap: 8px;
  align-items: center;
  padding: 6px 7px;
  border-radius: 3px;
  cursor: pointer;
}

.PodLogsModal__podMenu label:hover,
.PodLogsModal__severityMenu label:hover {
  background: rgba(127, 180, 255, 0.08);
}

.PodLogsModal__podMenu input,
.PodLogsModal__severityMenu input {
  appearance: none;
  display: grid;
  place-items: center;
  width: 15px;
  height: 15px;
  margin: 0;
  background: var(--layoutBackground);
  border: 1px solid var(--borderColor);
  border-radius: 3px;
  cursor: pointer;
}

.PodLogsModal__podMenu input:checked,
.PodLogsModal__severityMenu input:checked {
  background: #4b7bec;
  border-color: #7fb4ff;
}

.PodLogsModal__podMenu input:checked::after,
.PodLogsModal__severityMenu input:checked::after {
  width: 7px;
  height: 4px;
  content: "";
  border-left: 2px solid #fff;
  border-bottom: 2px solid #fff;
  transform: translateY(-1px) rotate(-45deg);
}

.PodLogsModal__podMenu input:focus-visible,
.PodLogsModal__severityMenu input:focus-visible {
  outline: 2px solid rgba(127, 180, 255, 0.45);
  outline-offset: 2px;
}

.PodLogsModal__podMenu span,
.PodLogsModal__severityMenu span {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.PodLogsModal__toolbar select,
.PodLogsModal__toolbar input:not([type="checkbox"]) {
  height: 28px;
  color: var(--textColorPrimary);
  background: var(--layoutBackground);
  border: 1px solid var(--borderColor);
  border-radius: 4px;
  outline: none;
}

.PodLogsModal__toolbar select {
  padding: 0 8px;
}

.PodLogsModal__toolbar input:not([type="checkbox"]) {
  flex: 1;
  min-width: 160px;
  padding: 0 10px;
}

.PodLogsModal__toolbar input:not([type="checkbox"]):focus,
.PodLogsModal__toolbar select:focus {
  border-color: #4b7bec;
}

.PodLogsModal__toolbar button {
  height: 28px;
  padding: 0 10px;
  color: var(--textColorPrimary);
  background: var(--layoutBackground);
  border: 1px solid var(--borderColor);
  border-radius: 4px;
  cursor: pointer;
}

.PodLogsModal__toolbar button.is-active {
  color: #72c98f;
  border-color: #31a66a;
  background: rgba(49, 166, 106, 0.12);
}

.PodLogsModal__severityFilter > button.is-active {
  color: #7fb4ff;
  border-color: #4b7bec;
  background: rgba(75, 123, 236, 0.12);
}

.PodLogsModal__toolbar button.is-danger {
  color: #e06c75;
  border-color: #d44848;
  background: rgba(212, 72, 72, 0.12);
}

.PodLogsModal__toolbar button:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

.PodLogsModal__count {
  min-width: 88px;
  color: var(--textColorSecondary);
  font-size: 12px;
  text-align: right;
}

.PodLogsModal__notice,
.PodLogsModal__state {
  margin: 12px 16px 0;
  padding: 9px 10px;
  color: var(--textColorSecondary);
  background: var(--layoutBackground);
  border: 1px solid var(--borderColor);
  border-radius: 4px;
  font-size: 12px;
}

.PodLogsModal__terminal {
  flex: 1;
  min-height: 0;
  margin: 14px 16px 16px;
  padding: 10px 0;
  overflow: auto;
  color: #d8dee9;
  background: #101419;
  border: 1px solid var(--borderColor);
  border-radius: 4px;
  font-family: var(--font-monospace);
  font-size: 11px;
  line-height: 1.65;
}

.PodLogsModal__line {
  position: relative;
  display: grid;
  grid-template-columns: 282px 58px 230px minmax(0, 1fr);
  gap: 8px;
  align-items: center;
  height: 24px;
  padding: 0 10px;
  white-space: pre;
  word-break: normal;
  overflow: hidden;
}

.PodLogsModal__excludeButton {
  position: absolute;
  right: 12px;
  top: 50%;
  transform: translateY(-50%);
  display: flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  padding: 0 0 2px 0;
  color: var(--textColorSecondary);
  background: var(--contentColor);
  border: 1px solid var(--borderColor);
  border-radius: 4px;
  font-size: 18px;
  line-height: 1;
  cursor: pointer;
  opacity: 0;
  transition: opacity 0.15s ease-in-out, background 0.15s;
  z-index: 5;
}

.PodLogsModal__line:hover .PodLogsModal__excludeButton {
  opacity: 0.8;
}

.PodLogsModal__excludeButton:hover {
  opacity: 1 !important;
  color: #fff;
  background: #e06c75;
  border-color: #d44848;
}

.PodLogsModal__terminal.is-wrapped .PodLogsModal__line {
  white-space: pre-wrap;
  word-break: break-word;
  align-items: start;
  height: auto;
  min-height: 24px;
  padding-top: 4px;
  padding-bottom: 4px;
  padding-right: 40px;
  overflow: visible;
}

.PodLogsModal__line:hover {
  background: rgba(127, 180, 255, 0.08);
}

.PodLogsModal__line.is-current-match {
  background: rgba(127, 180, 255, 0.16);
  box-shadow: inset 3px 0 0 #7fb4ff;
}

.PodLogsModal__line.is-error {
  color: var(--colorError);
}

.PodLogsModal__line.severity-error {
  background: rgba(212, 72, 72, 0.08);
}

.PodLogsModal__line.severity-warning {
  background: rgba(217, 155, 32, 0.07);
}

.PodLogsModal__time {
  overflow: hidden;
  color: #7b8794;
  text-overflow: clip;
  white-space: nowrap;
}

.PodLogsModal__severity {
  overflow: hidden;
  color: #7b8794;
  font-weight: 700;
  text-overflow: clip;
  white-space: nowrap;
}

.PodLogsModal__line.severity-error .PodLogsModal__severity {
  color: #e06c75;
}

.PodLogsModal__line.severity-warning .PodLogsModal__severity {
  color: #d7aa5f;
}

.PodLogsModal__line.severity-info .PodLogsModal__severity {
  color: #72c98f;
}

.PodLogsModal__line.severity-debug .PodLogsModal__severity {
  color: #56b6c2;
}

.PodLogsModal__source {
  overflow: hidden;
  font-weight: 600;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.PodLogsModal__message {
  overflow: visible;
  min-width: 0;
}

.PodLogsModal__terminal:not(.is-wrapped) .PodLogsModal__message {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.PodLogsModal__line mark {
  color: #101419;
  background: #ffd166;
  border-radius: 2px;
  padding: 0 2px;
}

.PodLogsModal__line.source-0 .PodLogsModal__source { color: #7fb4ff; }
.PodLogsModal__line.source-1 .PodLogsModal__source { color: #72c98f; }
.PodLogsModal__line.source-2 .PodLogsModal__source { color: #d7aa5f; }
.PodLogsModal__line.source-3 .PodLogsModal__source { color: #c792ea; }
.PodLogsModal__line.source-4 .PodLogsModal__source { color: #56b6c2; }
.PodLogsModal__line.source-5 .PodLogsModal__source { color: #e06c75; }
.PodLogsModal__line.source-6 .PodLogsModal__source { color: #98c379; }
.PodLogsModal__line.source-7 .PodLogsModal__source { color: #abb2bf; }

.TopologyContextMenu {
  position: fixed;
  z-index: 1000;
  min-width: 180px;
  padding: 4px 0;
  background: var(--mainBackground, #1e2228);
  border: 1px solid var(--borderColor);
  border-radius: 8px;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.35), 0 0 0 1px rgba(255, 255, 255, 0.04);
}

.TopologyContextMenu__item {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  padding: 7px 14px;
  border: none;
  background: none;
  color: var(--textColorPrimary);
  font-size: 12px;
  text-align: left;
  cursor: pointer;
  white-space: nowrap;
  transition: background 0.1s;
}

.TopologyContextMenu__item:hover {
  background: rgba(127, 180, 255, 0.1);
}

.TopologyContextMenu__icon {
  width: 16px;
  text-align: center;
  font-size: 13px;
  opacity: 0.6;
  flex-shrink: 0;
}

.TopologyContextMenu__separator {
  height: 1px;
  margin: 4px 10px;
  background: var(--borderColor);
}

.HelpOverlay__backdrop {
  position: fixed;
  inset: 0;
  background: rgba(0,0,0,0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 9999;
}

.HelpOverlay {
  background: var(--mainBackground);
  border: 1px solid var(--borderColor);
  border-radius: 10px;
  padding: 24px 32px;
  min-width: 340px;
  max-width: 420px;
  box-shadow: 0 12px 40px rgba(0,0,0,0.4);
}

.HelpOverlay h3 {
  margin: 0 0 16px;
  font-size: 15px;
  font-weight: 600;
  color: var(--textColorPrimary);
}

.HelpOverlay__grid {
  display: grid;
  grid-template-columns: auto 1fr;
  gap: 8px 16px;
  align-items: center;
}

.HelpOverlay__grid kbd {
  display: inline-block;
  padding: 2px 8px;
  background: rgba(255,255,255,0.08);
  border: 1px solid var(--borderColor);
  border-radius: 4px;
  font-family: var(--font-monospace, monospace);
  font-size: 11px;
  color: var(--textColorPrimary);
  min-width: 28px;
  text-align: center;
}

.HelpOverlay__grid span {
  font-size: 12px;
  color: var(--textColorSecondary);
}

.HelpOverlay__close {
  display: block;
  margin: 20px auto 0;
  padding: 6px 20px;
  background: var(--contentColor);
  border: 1px solid var(--borderColor);
  border-radius: 4px;
  color: var(--textColorPrimary);
  cursor: pointer;
  font-size: 12px;
}

.HelpOverlay__close:hover {
  background: var(--borderColor);
}

.ConfirmDialog__backdrop {
  position: fixed;
  inset: 0;
  z-index: 1100;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.5);
}

.ConfirmDialog {
  width: 380px;
  padding: 20px 24px;
  background: var(--mainBackground, #1e2228);
  border: 1px solid var(--borderColor);
  border-radius: 10px;
  box-shadow: 0 12px 40px rgba(0, 0, 0, 0.4);
}

.ConfirmDialog h3 {
  margin: 0 0 12px;
  font-size: 15px;
  font-weight: 700;
}

.ConfirmDialog p {
  margin: 0 0 8px;
  font-size: 13px;
  color: var(--textColorPrimary);
  line-height: 1.5;
}

.ConfirmDialog__hint {
  color: var(--textColorSecondary) !important;
  font-size: 12px !important;
}

.ConfirmDialog__select {
  width: 100%;
  height: 32px;
  margin: 8px 0;
  padding: 0 8px;
  color: var(--textColorPrimary);
  background: var(--contentColor);
  border: 1px solid var(--borderColor);
  border-radius: 4px;
  font-size: 12px;
}

.ConfirmDialog__actions button:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.ConfirmDialog__actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 18px;
}

.ConfirmDialog__actions button {
  height: 32px;
  padding: 0 16px;
  border: 1px solid var(--borderColor);
  border-radius: 6px;
  background: var(--contentColor);
  color: var(--textColorPrimary);
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
}

.ConfirmDialog__actions button.is-danger {
  background: #d44848;
  border-color: #d44848;
  color: #fff;
}

.ConfirmDialog__actions button.is-danger:hover {
  background: #c03a3a;
}
`;
