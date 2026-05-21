import { Icon } from '../../icons';

interface NoSpaceCardProps {
  summary?: string;
}

export function NoSpaceCard({ summary }: NoSpaceCardProps) {
  return (
    <div className="failed-card">
      <div className="title">
        <Icon name="alert" size={14} />
        조건에 맞는 공간이 없어요
      </div>
      <div className="body">
        {summary ??
          '자연·명륜 양 캠퍼스를 모두 확인했지만 해당 조건을 만족하는 공간을 찾지 못했습니다.'}
      </div>
    </div>
  );
}
