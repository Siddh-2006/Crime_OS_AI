import React from 'react';

interface TextFormatterProps {
  text: string;
  className?: string;
}

export function TextFormatter({ text, className = '' }: TextFormatterProps): React.ReactElement {
  if (!text) return <span className={className}>{text}</span>;

  // Split by newlines first to preserve paragraphs
  const paragraphs = text.split('\n');

  return (
    <div className={className}>
      {paragraphs.map((paragraph, pIdx) => {
        if (!paragraph.trim()) return <br key={pIdx} />;
        
        // Match numbers, amounts, dates, percentages, and phone numbers
        const regex = /(\b(?:Rs\.?|INR|\$)?\s?\d+(?:,\d+)*(?:\.\d+)?\b%?|\b\d{2}[-/]\d{2}[-/]\d{4}\b|\b(?:\+91|91|0)?\s?[6-9]\d{9}\b)/g;
        
        const parts = paragraph.split(regex);
        
        return (
          <p key={pIdx} className="mb-2 last:mb-0">
            {parts.map((part, idx) => {
              if (part.match(regex)) {
                // Highlight numbers and entities
                return (
                  <strong 
                    key={idx} 
                    className="text-brand-primary font-mono font-bold bg-brand-primary/10 px-1 py-0.5 rounded-md border border-brand-primary/20 mx-0.5"
                  >
                    {part}
                  </strong>
                );
              }
              return <span key={idx}>{part}</span>;
            })}
          </p>
        );
      })}
    </div>
  );
}
