import { useRef, type CSSProperties } from "react";
import { Mountain, CircleHelp, RotateCcw, Undo2, Flag, X, MapPin } from "lucide-react";
import { usePlanner, newPlan } from "./hooks/usePlanner";
import { MapView } from "./components/MapView";
import { CandidatePanel } from "./components/CandidatePanel";
import { confirmCandidate, finishPlan, undoPlan } from "./lib/planner";
import { money, distance } from "./lib/format";
import { BUDGET_MIN, BUDGET_MAX, BUDGET_STEP } from "./lib/testConfig";

export default function App() {
  const { metadata, fare, places, plan, setPlan, candidate, setCandidate,
    analysis, busy, error, notice, setNotice, fresh } = usePlanner();
  const info = useRef<HTMLDialogElement>(null);
  const reset = () => {
    if (!metadata) return;
    setPlan(newPlan(metadata));
    setCandidate(null);
    setNotice("");
  };
  const returnCost = analysis?.returnRoute?.fare.total;
  const canFinish = fresh && !!analysis?.returnRoute &&
    analysis.returnRoute.fare.total <= analysis.remaining && !!plan?.visits.length;
  return (
    <div className="app-shell">
      <header className="app-header">
        <div className="brand"><Mountain size={25} /><h1>단양 한바퀴</h1><span className="test-badge">테스트</span></div>
        <button className="icon-button" aria-label="이용 안내" onClick={() => info.current?.showModal()}><CircleHelp size={22} /></button>
      </header>
      <main className="workspace">
        {metadata && plan ? <MapView metadata={metadata} plan={plan} analysis={analysis}
          places={places} onSelect={(place) => { if (!plan.finished) setCandidate(place); }}
          busy={busy && !error} fresh={fresh} /> :
          <section className="map-placeholder"><Mountain size={40} /><p>단양의 도로를 불러오는 중</p></section>}
        <section className="dashboard" aria-label="여행 대시보드">
          {(error || notice) && <div className={error ? "error-box" : "notice"} role={error ? "alert" : "status"}>
            <span>{error || notice}</span>
            {error ? <button onClick={() => window.location.reload()}>다시 불러오기</button> :
              <button className="icon-button" aria-label="알림 닫기" onClick={() => setNotice("")}><X size={18} /></button>}
          </div>}
          {plan && <div className="dashboard-grid">
            <section className="budget-section" aria-label="예산 선택과 현황">
              <div className="budget-heading"><label htmlFor="budget">하루 택시 예산</label><output htmlFor="budget">{plan.budget / 10000}<span>만 원</span></output></div>
              <input id="budget" className="budget-slider" type="range" min={BUDGET_MIN} max={BUDGET_MAX} step={BUDGET_STEP}
                value={plan.budget} aria-valuetext={`${plan.budget / 10000}만 원`}
                style={{ "--progress": `${(plan.budget - BUDGET_MIN) / (BUDGET_MAX - BUDGET_MIN) * 100}%` } as CSSProperties}
                onChange={(event) => setPlan({ ...plan, budget: Number(event.target.value) })} />
              <div className="budget-ticks" aria-hidden="true">{[2, 4, 6, 8, 10, 12, 14, 16].map(n => <span className={n * 10000 === plan.budget ? "selected" : ""} key={n}>{n}만</span>)}</div>
              <dl className="budget-stats" aria-live="polite" aria-busy={busy}>
                <div><dt>사용 예정</dt><dd>{fresh && analysis ? money(analysis.spent) : "계산 중"}</dd></div>
                <div><dt>남은 예산</dt><dd className={analysis && analysis.remaining < 0 ? "negative" : ""}>{fresh && analysis ? money(analysis.remaining) : "계산 중"}</dd></div>
                <div><dt>소노길 복귀비</dt><dd>{fresh ? returnCost !== undefined ? money(returnCost) : "경로 없음" : "계산 중"}</dd></div>
              </dl>
              {fresh && analysis && returnCost !== undefined && analysis.remaining < returnCost &&
                <p className="inline-warning" role="alert">복귀까지 {money(returnCost - analysis.remaining)} 부족합니다. 예산을 늘리거나 방문을 취소해 주세요.</p>}
            </section>
            <section className="decision-section" aria-label="방문지 선택">
              {!plan.finished && candidate ? fresh && analysis?.candidate ?
                <CandidatePanel result={analysis.candidate} disabled={!fresh} onClear={() => setCandidate(null)}
                  onConfirm={() => { setPlan(confirmCandidate(plan, analysis)); setCandidate(null); }} /> :
                <div className="empty-candidate" role="status"><span className="spinner" /><p>방문·복귀 요금 계산 중</p><button className="icon-button" aria-label="후보지 해제" onClick={() => setCandidate(null)}><X size={18} /></button></div> :
                <div className="empty-candidate"><MapPin size={24} /><div><strong>{plan.finished ? "여행 경로 완성" : "주소 검색 또는 지도에서 선택"}</strong><p>{plan.finished && fresh && analysis ? `총 ${distance(analysis.totalDistance)} · 택시 ${analysis.rides}회` : "초록 도로는 소노길 복귀 비용까지 확보돼요."}</p></div></div>}
            </section>
            <section className="plan-section" aria-label="경로 관리">
              <div className="fixed-origin"><MapPin size={17} /><strong>소노길 출발 · 복귀</strong><span>고정</span></div>
              {plan.visits.length > 0 && <details className="trip-details"><summary>방문지 {plan.visits.length}곳 보기</summary>
                <ol>{plan.visits.map((visit, i) => <li key={`${i}-${visit.lng}`}><span>{visit.name}{visit.addressEstimate && " (도로 추정)"}</span><small>{fresh && analysis?.confirmed[i] ? money(analysis.confirmed[i].fare.total) : "계산 중"}</small></li>)}</ol>
              </details>}
              <div className="plan-actions">
                {(plan.visits.length > 0 || plan.finished) && <button className="outline" onClick={() => { setPlan(undoPlan(plan)); setCandidate(null); }}><Undo2 size={17} />{plan.finished ? "완료 취소" : "되돌리기"}</button>}
                {!plan.finished && plan.visits.length > 0 && <button className="primary" disabled={!canFinish}
                  onClick={() => { if (analysis && fresh) { setPlan(finishPlan(plan, analysis)); setCandidate(null); } }}><Flag size={17} />소노길로 복귀</button>}
                <button className="outline reset" onClick={reset}><RotateCcw size={17} />새 계획</button>
              </div>
              <p className="fare-note">예상 요금 · 여유율 10% 포함</p>
            </section>
          </div>}
        </section>
      </main>
      <dialog ref={info} className="info-modal" onClick={event => { if (event.target === info.current) info.current.close(); }}>
        <div className="modal-content">
          <div className="section-title"><h2>이용 안내</h2><button className="icon-button" aria-label="이용 안내 닫기" onClick={() => info.current?.close()}><X size={22} /></button></div>
          <p>소노길에서 출발해 같은 곳으로 돌아오는 여행입니다. 예산을 고른 뒤 지도에서 방문지를 누르고, 요금을 확인해 확정하세요. 확정할 때 해당 탑승 요금만 차감됩니다.</p>
          <p>예산은 2만~16만 원, 2만 원 간격입니다. 테스트 버전에서는 출발·복귀 지점, 여유율(10%), 호출료(미포함)가 고정되며 경로 내보내기를 제공하지 않습니다.</p>
          <p>소노길의 도로상 대표 위치를 사용합니다. 특정 시설의 출입구를 뜻하지 않습니다.</p>
          <h3>도로명주소 검색</h3>
          <p>예: 삼봉로 123, 상선암길 52-8. 단양군 기초번호가 일치하는 도로 구간의 대표 위치를 찾습니다. 건물 존재나 출입구 위치는 확인하지 않으며, 읍면별 주소 유효성도 검증하지 않습니다. 같은 번호의 후보가 여러 개이면 지도를 확인해 선택하세요.</p>
          <h3>요금과 도로</h3>
          <p>주간 거리 기반 예상 금액입니다. 시간요금·심야할증·통행료는 제외됩니다. 원본에 일방통행·차량 통행 제한·교량 높이 정보가 없어 실제 운행과 다를 수 있습니다.</p>
          <p>0.5m 이내의 작은 도로 틈을 보정했습니다. 선 내부 교차는 자동 연결하지 않으며, 군 밖을 경유하는 도로는 포함하지 않습니다.</p>
          <p>{fare?.verification}</p>
          <a href={fare?.sourceUrl} target="_blank" rel="noreferrer">단양군 운임 안내</a>
          <p>확정한 계획은 이 브라우저에 자동 저장됩니다.</p>
        </div>
      </dialog>
    </div>
  );
}
