import { Check, X } from "lucide-react";
import type { CandidateResult } from "../types";
import { money, distance } from "../lib/format";

export function CandidatePanel({ result, disabled, onConfirm, onClear }: {
  result: CandidateResult; disabled: boolean; onConfirm: () => void; onClear: () => void;
}) {
  const issue = result.issue === "no-access" ? result.requested.addressEstimate ? "해당 주소의 도로를 분석망에 연결할 수 없습니다. 지도에서 위치를 확인해 주세요." : "500m 이내에 도로가 없습니다. 도로 가까이 선택해 주세요."
    : result.issue === "no-outward" ? "방문지까지 연결된 도로가 없습니다."
    : result.issue === "no-return" ? "소노길로 돌아오는 경로가 없습니다."
    : result.issue === "same-position" ? "현재 위치입니다. 다른 방문지를 선택해 주세요." : null;
  return <section className="candidate-card" aria-label="후보 목적지 조회">
    <div className="candidate-info">
    <div className="section-title"><h2>{result.snap?.name || result.requested.name || "선택한 위치"}</h2><button className="icon-button" aria-label="후보지 해제" onClick={onClear}><X size={20} /></button></div>
    {issue ? <p className="inline-warning">{issue}</p> : <>
      <div className="candidate-routes">
        <div><span><i className="route-dot orange" />방문 · {distance(result.outward!.distance)}</span><strong>{money(result.outward!.fare.total)}</strong></div>
        <div><span><i className="route-dot purple" />복귀 · {distance(result.homeward!.distance)}</span><strong>{money(result.homeward!.fare.total)}</strong></div>
      </div>
      <p className={result.affordable ? "candidate-balance" : "inline-warning"}>{result.affordable ? `확정 후 남은 예산 ${money(result.afterReturn!)}` : `확정 시 ${money(-result.afterReturn!)} 부족해요`}</p>
    </>}
    {result.snap && result.snap.distanceToRoad > 50 && <p className="inline-warning">선택 지점에서 약 {Math.round(result.snap.distanceToRoad)}m 떨어진 도로 기준입니다. 도보 접근은 확인되지 않았습니다.</p>}
    </div>
    <button className="primary full candidate-confirm" disabled={disabled || !result.affordable || !!result.issue} onClick={onConfirm}><Check size={19} /><span>방문지 확정</span></button>
  </section>;
}
