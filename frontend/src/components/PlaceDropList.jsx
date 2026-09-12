import { useDroppable } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';

// A list that accepts drops even when it is empty, which is how a place gets
// moved into a ranking that has nothing in it yet.
export default function PlaceDropList({ id, items, empty, children }) {
  const { setNodeRef, isOver } = useDroppable({ id });

  return (
    <SortableContext items={items} strategy={verticalListSortingStrategy}>
      <div ref={setNodeRef} className={isOver ? 'list drop-target' : 'list'}>
        {children}
        {items.length === 0 && <p className="empty-state">{empty}</p>}
      </div>
    </SortableContext>
  );
}
