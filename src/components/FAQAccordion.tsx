import { useState, useRef, useEffect, useCallback } from 'react';

interface FAQItem {
  question: string;
  answer: string;
}

interface Props {
  items: FAQItem[];
  title?: string;
}

function AccordionItem({
  item,
  isOpen,
  onToggle,
  index,
}: {
  item: FAQItem;
  isOpen: boolean;
  onToggle: () => void;
  index: number;
}) {
  const contentRef = useRef<HTMLDivElement>(null);
  const [maxHeight, setMaxHeight] = useState(0);

  useEffect(() => {
    if (contentRef.current) {
      setMaxHeight(isOpen ? contentRef.current.scrollHeight : 0);
    }
  }, [isOpen]);

  const panelId = `faq-panel-${index}`;
  const headingId = `faq-heading-${index}`;

  return (
    <div className="border-b border-gray-200 last:border-0">
      <button
        type="button"
        id={headingId}
        role="button"
        aria-expanded={isOpen}
        aria-controls={panelId}
        onClick={onToggle}
        className="flex w-full items-center justify-between py-4 text-left font-medium text-gray-900 hover:bg-gray-50 transition-colors px-1 -mx-1 rounded"
      >
        <span>{item.question}</span>
        <svg
          xmlns="http://www.w3.org/2000/svg"
          className={`ml-4 h-5 w-5 shrink-0 text-gray-400 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      <div
        id={panelId}
        role="region"
        aria-labelledby={headingId}
        className="overflow-hidden transition-[max-height] duration-300 ease-in-out"
        style={{ maxHeight: `${maxHeight}px` }}
      >
        <div ref={contentRef} className="pb-4 text-sm text-gray-600 leading-relaxed">
          {item.answer}
        </div>
      </div>
    </div>
  );
}

export default function FAQAccordion({ items, title = 'Czesto zadawane pytania' }: Props) {
  const [openIndex, setOpenIndex] = useState<number | null>(null);

  const handleToggle = useCallback((index: number) => {
    setOpenIndex((prev) => (prev === index ? null : index));
  }, []);

  if (!items || items.length === 0) return null;

  return (
    <section className="mx-auto max-w-3xl">
      {title && (
        <h2 className="mb-8 text-center text-2xl font-bold text-gray-900 sm:text-3xl">
          {title}
        </h2>
      )}
      <div>
        {items.map((item, i) => (
          <AccordionItem
            key={i}
            item={item}
            index={i}
            isOpen={openIndex === i}
            onToggle={() => handleToggle(i)}
          />
        ))}
      </div>
    </section>
  );
}
