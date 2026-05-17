import { useEffect, useState } from 'react';
import type {
  ApplicationState,
  AutomationStatus,
  FilledSlots,
  ReservationFormData,
  SearchLogEntry,
  SpaceCandidate,
} from '../../shared/types';

interface Props {
  status: AutomationStatus;
  candidate: SpaceCandidate | null;
  searchLog: SearchLogEntry[];
  lastFilledSlots: FilledSlots | null;
  applicationState: ApplicationState | null;
  draftFormData: ReservationFormData | null;
  candidateCardKey: string;
  onConfirmNavigation: (confirmed: boolean) => void;
  onResumeAfterLogin: () => void;
  onApplySuggestedMemory: () => void;
  onDismissSuggestedMemory: () => void;
  onRequestApplicationEdit: () => void;
  onConfirmReservation: () => void;
  onRejectCandidate: () => void;
}

const HANGSA_LABELS: Record<string, string> = {
  '111': '학생회/동아리',
  '113': '세미나/스터디',
  '115': '보충수업/특강/시험',
  '112': '본부부서주관행사',
  '114': '단과대학주관행사',
  '116': '학과주관행사',
  '001': '교외단체행사',
  '117': '기타',
};

const SOURCE_LABELS: Record<NonNullable<ApplicationState['source']>, string> = {
  conversation: '대화에서 생성',
  memory: '이전 대화 추천',
  user_modified: '사용자 수정',
};

function formatDate(date: string | null): string | null {
  if (!date) return null;
  const parsed = new Date(`${date}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return date;
  return new Intl.DateTimeFormat('ko-KR', {
    month: 'numeric',
    day: 'numeric',
    weekday: 'short',
  }).format(parsed);
}

function formatRequestSummary(slots: FilledSlots | null): string | null {
  if (!slots) return null;
  const parts = [
    formatDate(slots.date),
    slots.start_time
      ? `${slots.start_time} - ${slots.end_time ?? `${slots.duration_min ?? '?'}분 뒤`}`
      : null,
    typeof slots.headcount === 'number' ? `${slots.headcount}명` : null,
    slots.campus?.trim() || null,
  ].filter(Boolean);
  return parts.length > 0 ? parts.join(' · ') : null;
}

function formatLimitTime(limitTimeHHMM: string | null): string {
  if (!limitTimeHHMM) return '제한 없음';
  const [hourText, minuteText] = limitTimeHHMM.split(':');
  const hours = Number.parseInt(hourText ?? '0', 10);
  const minutes = Number.parseInt(minuteText ?? '0', 10);
  const parts: string[] = [];
  if (hours > 0) parts.push(`${hours}시간`);
  if (minutes > 0) parts.push(`${minutes}분`);
  return parts.join(' ') || limitTimeHHMM;
}

function statusHeading(status: AutomationStatus, hasCandidate: boolean): string {
  switch (status.kind) {
    case 'opening_gls':
      return 'GLS 페이지를 준비하고 있어요';
    case 'navigation_required':
      return 'GLS 페이지로 이동할까요?';
    case 'login_required':
      return '로그인이 필요해요';
    case 'candidate_found':
      return hasCandidate ? '이 공간 어떠세요?' : '추천 후보를 찾았어요';
    case 'searching':
      return '공간을 확인하고 있어요';
    case 'no_candidate':
      return '조건에 맞는 공간을 찾지 못했어요';
    case 'done':
      return '예약이 완료되었어요';
    case 'submitting':
      return '예약을 제출하고 있어요';
    case 'error':
      return '진행 중 오류가 발생했어요';
    default:
      return '추천 패널';
  }
}

function statusDescription(
  status: AutomationStatus,
  searchLogCount: number,
  applicationState: ApplicationState | null,
): string | null {
  switch (status.kind) {
    case 'searching':
      return `${status.tried}/${status.total}개 후보를 확인했습니다.`;
    case 'candidate_found':
      if (applicationState?.needs_application_collection) {
        return '신청 정보를 한 줄로 설명해 주시면 에이전트가 신청서를 채울게요.';
      }
      return searchLogCount > 0 ? `확인한 후보 ${searchLogCount}개 중 가능한 공간입니다.` : null;
    case 'no_candidate':
      return searchLogCount > 0 ? `검토한 ${searchLogCount}개 공간의 충돌 사유를 카드로 확인할 수 있어요.` : null;
    case 'done':
      return `공간 코드 ${status.spaceCode} 예약이 끝났습니다.`;
    case 'opening_gls':
      return '예약 사이트 연결이 끝나면 후보 탐색을 시작합니다.';
    case 'submitting':
      return '현재 신청서를 저장하고 있으니 잠시만 기다려 주세요.';
    case 'error':
      return status.message;
    default:
      return null;
  }
}

function fallbackCardMessage(status: AutomationStatus): string {
  switch (status.kind) {
    case 'opening_gls':
      return 'GLS 페이지를 여는 동안 이 영역이 추천 카드 자리로 유지됩니다.';
    case 'submitting':
      return '신청서 제출이 끝나면 결과를 여기와 채팅에 함께 보여드릴게요.';
    case 'done':
      return '예약이 완료되었습니다. 다른 조건으로 다시 찾으려면 새 메시지를 보내 주세요.';
    case 'no_candidate':
      return '시간대나 인원 조건을 조금 조정하면 다시 후보를 찾을 수 있어요.';
    case 'error':
      return status.message;
    default:
      return '채팅 요청을 보내면 이 영역에서 후보 공간을 카드로 보여드릴게요.';
  }
}

function SearchResultCard({
  entry,
  index,
  total,
}: {
  entry: SearchLogEntry;
  index: number;
  total: number;
}) {
  return (
    <article className={`review-card review-card--${entry.available ? 'ok' : 'bad'}`}>
      <div className="review-card__header">
        <div>
          <div className="review-card__eyebrow">
            {entry.available ? '추천 후보' : '검토한 후보'} {index + 1} / {total}
          </div>
          <div className="review-card__title">
            {entry.buildingName} {entry.roomName}
          </div>
        </div>
        <span className={`review-card__badge review-card__badge--${entry.available ? 'ok' : 'bad'}`}>
          {entry.available ? '가능' : '불가'}
        </span>
      </div>

      <div className="review-card__code">공간 코드 {entry.glsSpaceCode}</div>

      {entry.available ? (
        <div className="review-card__empty">
          이 공간은 현재 시간대에 이용 가능해요. 신청 정보만 정리되면 바로 제출할 수 있습니다.
        </div>
      ) : entry.conflicts.length > 0 ? (
        <div className="review-card__conflicts">
          {entry.conflicts.slice(0, 3).map((conflict, conflictIndex) => (
            <div key={`${entry.glsSpaceCode}-${conflictIndex}`} className="review-card__conflict">
              <span className="review-card__conflict-kind">{conflict.kind || '충돌'}</span>
              <div className="review-card__conflict-body">
                {conflict.timeTerm && (
                  <div className="review-card__conflict-time">{conflict.timeTerm}</div>
                )}
                <div className="review-card__conflict-info">{conflict.info.trim()}</div>
              </div>
            </div>
          ))}
          {entry.conflicts.length > 3 && (
            <div className="review-card__more">+{entry.conflicts.length - 3}건 더 있음</div>
          )}
        </div>
      ) : (
        <div className="review-card__empty">충돌 상세 정보가 없어서 다른 후보를 계속 확인했어요.</div>
      )}
    </article>
  );
}

function SuggestedMemoryCard({
  label,
  onApply,
  onDismiss,
  onRejectCandidate,
}: {
  label: string;
  onApply: () => void;
  onDismiss: () => void;
  onRejectCandidate: () => void;
}) {
  return (
    <article className="review-card review-card--ok review-card--candidate">
      <div className="review-card__eyebrow">추천 신청 정보</div>
      <div className="review-card__title review-card__title--compact">{label}</div>
      <div className="review-card__note">
        현재 대화와 비슷한 지난 예약 정보를 찾았어요. 그대로 불러오거나 새로 설명할 수 있어요.
      </div>
      <div className="review-card__actions">
        <button type="button" className="btn btn--primary" onClick={onApply}>
          추천 정보 사용
        </button>
        <button type="button" className="btn" onClick={onDismiss}>
          새로 설명하기
        </button>
        <button type="button" className="btn" onClick={onRejectCandidate}>
          다른 후보 보기
        </button>
      </div>
    </article>
  );
}

function ApplicationSummaryCard({
  candidate,
  applicationState,
  draftFormData,
  cardIndex,
  totalCards,
  onConfirm,
  onRequestEdit,
  onReject,
}: {
  candidate: SpaceCandidate;
  applicationState: ApplicationState | null;
  draftFormData: ReservationFormData | null;
  cardIndex: number;
  totalCards: number;
  onConfirm: () => void;
  onRequestEdit: () => void;
  onReject: () => void;
}) {
  const summaryItems = [
    { label: '수용 인원', value: `${candidate.capacityMin}~${candidate.capacityMax}명` },
    { label: '최대 이용', value: formatLimitTime(candidate.limitTimeHHMM) },
    { label: '조직 우선', value: candidate.isUserOrgPreferred ? '예' : '일반' },
  ];
  const sourceLabel = applicationState?.source ? SOURCE_LABELS[applicationState.source] : null;
  const hasCompleteDraft =
    !!draftFormData &&
    !applicationState?.needs_application_collection &&
    applicationState?.missing_application.length === 0;

  return (
    <article className="review-card review-card--ok review-card--candidate">
      <div className="review-card__header">
        <div>
          <div className="review-card__eyebrow">추천 후보 {cardIndex + 1} / {totalCards}</div>
          <div className="review-card__title">
            {candidate.buildingName} {candidate.roomName}
          </div>
        </div>
        <span className="review-card__badge review-card__badge--ok">가능</span>
      </div>

      <div className="review-card__code">공간 코드 {candidate.glsSpaceCode}</div>

      <div className="review-card__summary-grid">
        {summaryItems.map((item) => (
          <div key={item.label} className="review-card__summary-item">
            <span className="review-card__summary-label">{item.label}</span>
            <span className="review-card__summary-value">{item.value}</span>
          </div>
        ))}
      </div>

      {candidate.contents && <div className="review-card__note">{candidate.contents}</div>}
      {candidate.useJojikName && (
        <div className="review-card__warn">사용권한 조직: {candidate.useJojikName}</div>
      )}

      {draftFormData ? (
        <div className="application-summary">
          <div className="application-summary__header">
            <span className="application-summary__title">신청 정보 요약</span>
            {sourceLabel && <span className="application-summary__source">{sourceLabel}</span>}
          </div>
          <div className="application-summary__grid">
            <div className="application-summary__item">
              <span className="application-summary__label">행사구분</span>
              <span className="application-summary__value">
                {HANGSA_LABELS[draftFormData.hangsaGbCode] ?? draftFormData.hangsaGbCode}
              </span>
            </div>
            <div className="application-summary__item">
              <span className="application-summary__label">주관단체</span>
              <span className="application-summary__value">{draftFormData.organization}</span>
            </div>
            <div className="application-summary__item">
              <span className="application-summary__label">행사명</span>
              <span className="application-summary__value">{draftFormData.eventName}</span>
            </div>
            <div className="application-summary__item">
              <span className="application-summary__label">행사인원</span>
              <span className="application-summary__value">{draftFormData.headcount}명</span>
            </div>
            <div className="application-summary__item application-summary__item--wide">
              <span className="application-summary__label">사용목적</span>
              <span className="application-summary__value">{draftFormData.purpose}</span>
            </div>
          </div>
        </div>
      ) : (
        <div className="review-card__note">
          신청 정보가 아직 없어요. 채팅에 "소프트웨어학과 학생회 정기회의"처럼 한 줄로 알려 주시면
          에이전트가 채워둘게요.
        </div>
      )}

      {applicationState?.missing_application.includes('hangsaGbCode') && (
        <div className="review-card__warn">
          행사 성격이 애매해서 행사구분만 더 확인이 필요해요. 채팅으로 "학생회 행사에 가까워"처럼 답해
          주세요.
        </div>
      )}

      <div className="review-card__actions">
        <button
          type="button"
          className="btn btn--primary"
          onClick={onConfirm}
          disabled={!hasCompleteDraft}
        >
          이대로 신청
        </button>
        <button type="button" className="btn" onClick={onRequestEdit}>
          신청 정보 수정
        </button>
        <button type="button" className="btn" onClick={onReject}>
          다른 후보 보기
        </button>
      </div>
    </article>
  );
}

function NavigationCard({
  onConfirm,
  onReject,
}: {
  onConfirm: () => void;
  onReject: () => void;
}) {
  return (
    <article className="review-card">
      <div className="review-card__title review-card__title--compact">현재 탭을 GLS로 이동할까요?</div>
      <div className="review-card__note">
        이동하면 지금 보고 있는 탭이 GLS 페이지로 바뀌고, 그 탭에서 예약 탐색을 계속 진행합니다.
      </div>
      <div className="review-card__actions">
        <button type="button" className="btn btn--primary" onClick={onConfirm}>
          예, 이동합니다
        </button>
        <button type="button" className="btn" onClick={onReject}>
          아니오
        </button>
      </div>
    </article>
  );
}

function LoginCard({ onResume }: { onResume: () => void }) {
  return (
    <article className="review-card review-card--warn">
      <div className="review-card__title review-card__title--compact">현재 GLS 탭에서 로그인해 주세요.</div>
      <div className="review-card__note">
        로그인 후 아래 버튼을 누르면 같은 예약 요청으로 다시 시작합니다.
      </div>
      <div className="review-card__actions">
        <button type="button" className="btn btn--primary" onClick={onResume}>
          로그인 완료, 다시 시도
        </button>
      </div>
    </article>
  );
}

export function ReservationReviewPanel({
  status,
  candidate,
  searchLog,
  lastFilledSlots,
  applicationState,
  draftFormData,
  candidateCardKey,
  onConfirmNavigation,
  onResumeAfterLogin,
  onApplySuggestedMemory,
  onDismissSuggestedMemory,
  onRequestApplicationEdit,
  onConfirmReservation,
  onRejectCandidate,
}: Props) {
  const [activeIndex, setActiveIndex] = useState(0);

  useEffect(() => {
    if (candidate) {
      const candidateIndex = searchLog.findIndex((entry) => entry.glsSpaceCode === candidate.glsSpaceCode);
      setActiveIndex(candidateIndex >= 0 ? candidateIndex : Math.max(searchLog.length - 1, 0));
      return;
    }
    if (searchLog.length > 0) {
      setActiveIndex(searchLog.length - 1);
    } else {
      setActiveIndex(0);
    }
  }, [candidate, searchLog]);

  if (status.kind === 'idle' && searchLog.length === 0 && !candidate) {
    return null;
  }

  const clampedIndex = Math.min(activeIndex, Math.max(searchLog.length - 1, 0));
  const activeEntry = searchLog[clampedIndex] ?? null;
  const requestSummary = formatRequestSummary(lastFilledSlots);
  const heading = statusHeading(status, Boolean(candidate));
  const description = statusDescription(status, searchLog.length, applicationState);
  const showPager = searchLog.length > 1;
  const showingCandidate = Boolean(
    candidate && activeEntry && activeEntry.glsSpaceCode === candidate.glsSpaceCode,
  );

  return (
    <section className="review-panel">
      <div className="review-panel__header">
        <div className="review-panel__copy">
          <div className="review-panel__title">{heading}</div>
          {requestSummary && <div className="review-panel__request">{requestSummary}</div>}
          {description && <div className="review-panel__description">{description}</div>}
        </div>
        {showPager && (
          <div className="review-panel__pager">
            <button
              type="button"
              className="review-panel__pager-btn"
              onClick={() => setActiveIndex((prev) => Math.max(prev - 1, 0))}
              disabled={clampedIndex === 0}
              aria-label="이전 후보"
            >
              ‹
            </button>
            <span className="review-panel__pager-count">
              {clampedIndex + 1} / {searchLog.length}
            </span>
            <button
              type="button"
              className="review-panel__pager-btn"
              onClick={() => setActiveIndex((prev) => Math.min(prev + 1, searchLog.length - 1))}
              disabled={clampedIndex === searchLog.length - 1}
              aria-label="다음 후보"
            >
              ›
            </button>
          </div>
        )}
      </div>

      <div className="review-panel__body">
        {status.kind === 'navigation_required' ? (
          <NavigationCard
            onConfirm={() => onConfirmNavigation(true)}
            onReject={() => onConfirmNavigation(false)}
          />
        ) : status.kind === 'login_required' ? (
          <LoginCard onResume={onResumeAfterLogin} />
        ) : showingCandidate && candidate ? (
          applicationState?.suggested_memory ? (
            <SuggestedMemoryCard
              key={`${candidateCardKey}:suggested`}
              label={applicationState.suggested_memory.label}
              onApply={onApplySuggestedMemory}
              onDismiss={onDismissSuggestedMemory}
              onRejectCandidate={onRejectCandidate}
            />
          ) : (
            <ApplicationSummaryCard
              key={candidateCardKey}
              candidate={candidate}
              applicationState={applicationState}
              draftFormData={draftFormData}
              cardIndex={clampedIndex}
              totalCards={searchLog.length || 1}
              onConfirm={onConfirmReservation}
              onRequestEdit={onRequestApplicationEdit}
              onReject={onRejectCandidate}
            />
          )
        ) : activeEntry ? (
          <SearchResultCard entry={activeEntry} index={clampedIndex} total={searchLog.length} />
        ) : (
          <article className="review-card">
            <div className="review-card__empty">{fallbackCardMessage(status)}</div>
          </article>
        )}
      </div>
    </section>
  );
}
