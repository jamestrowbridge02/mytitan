import { OperatorStatusBadge } from "../ui/operator-page";

type OpsSignalsBarProps = {
  blockedBy: string[];
  risks: string[];
  severity: "none" | "info" | "warn" | "critical";
  compact?: boolean;
};

export default function OpsSignalsBar({ blockedBy, risks, severity, compact = false }: OpsSignalsBarProps) {
  const items = [
    ...blockedBy.map((item) => ({ label: `Blocked: ${item}`, kind: "blocked" })),
    ...risks.map((item) => ({ label: `At risk: ${item}`, kind: "risk" })),
  ];

  if (!items.length || severity === "none") return null;

  const baseStyle = compact ? { padding: "4px 8px", fontSize: 11 } : { padding: "4px 10px", fontSize: 12 };

  return (
    <div className="pill-row" style={{ marginBottom: compact ? 0 : 12 }}>
      {items.map((item) => (
        <OperatorStatusBadge
          key={item.label}
          compact={compact}
          label={item.label}
          style={baseStyle}
          tone={severity === "critical" ? "critical" : severity === "warn" ? "warning" : "info"}
        />
      ))}
    </div>
  );
}
