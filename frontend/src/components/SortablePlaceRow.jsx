import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

// One row that can be dragged within its list or across to the other one.
// The whole row is the handle; the buttons inside stop the press from starting a drag.
export default function SortablePlaceRow({ id, rank, meta, name, actions, expanded }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });

  const style = {
    transform: CSS.Translate.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
    zIndex: isDragging ? 2 : undefined,
  };

  return (
    <div
      className="item draggable"
      ref={setNodeRef}
      style={style}
      aria-label={`${name} 위치 옮기기`}
      {...attributes}
      {...listeners}
    >
      <div className="item-main">
        <span className={rank ? 'rank-dot' : 'rank-dot empty'} aria-hidden="true">
          {rank ?? '⠿'}
        </span>
        <div className="grow">
          <div className="name">{name}</div>
          <div className="meta">{meta}</div>
        </div>
        {actions && (
          // Keep taps on these controls from being read as the start of a drag.
          <div className="item-actions" onPointerDown={(e) => e.stopPropagation()}>
            {actions}
          </div>
        )}
      </div>
      {expanded && (
        <div className="item-expand" onPointerDown={(e) => e.stopPropagation()}>
          {expanded}
        </div>
      )}
    </div>
  );
}
