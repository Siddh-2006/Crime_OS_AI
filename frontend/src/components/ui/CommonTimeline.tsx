'use client';

import React from 'react';
import Timeline from '@mui/lab/Timeline';
import TimelineItem from '@mui/lab/TimelineItem';
import TimelineSeparator from '@mui/lab/TimelineSeparator';
import TimelineConnector from '@mui/lab/TimelineConnector';
import TimelineContent from '@mui/lab/TimelineContent';
import TimelineDot from '@mui/lab/TimelineDot';
import TimelineOppositeContent, {
  timelineOppositeContentClasses,
} from '@mui/lab/TimelineOppositeContent';

export interface CommonTimelineItem {
  id: string | number;
  time: React.ReactNode;
  content: React.ReactNode;
  actor?: React.ReactNode;
  icon?: React.ReactNode;
  tone?: 'default' | 'success' | 'warning' | 'danger';
  onClick?: () => void;
}

interface CommonTimelineProps {
  items: CommonTimelineItem[];
  emptyMessage?: string;
  className?: string;
}

const toneColors = {
  default: '#bdbdbd',
  success: '#159447',
  warning: '#b7791f',
  danger: '#c53030',
};

export function CommonTimeline({ items, emptyMessage = 'No timeline events recorded.', className = '' }: CommonTimelineProps) {
  if (items.length === 0) {
    return <p className={`text-sm text-text-muted italic ${className}`}>{emptyMessage}</p>;
  }

  return (
    <Timeline
      position="right"
      className={className}
      sx={{
        [`& .${timelineOppositeContentClasses.root}`]: {
          flex: 0.2,
        },
      }}
    >
      {items.map((item, index) => {
        const color = toneColors[item.tone || 'default'];
        return (
          <TimelineItem key={item.id}>
            <TimelineOppositeContent>{item.time}</TimelineOppositeContent>
            <TimelineSeparator>
                <TimelineDot
                  sx={{
                    m: 0,
                    p: 0,
                    width: item.icon ? 24 : 9,
                    height: item.icon ? 24 : 9,
                    minWidth: item.icon ? 24 : 9,
                    bgcolor: color,
                    color: item.icon ? 'inherit' : color,
                    boxShadow: 'none',
                  }}
                >
                  {item.icon}
                </TimelineDot>
              {index < items.length - 1 && (
                <TimelineConnector/>
              )}
            </TimelineSeparator>
            <TimelineContent>
              <div
                className={`min-w-0 text-left ${item.onClick ? 'cursor-pointer' : ''}`}
                onClick={item.onClick}
                role={item.onClick ? 'button' : undefined}
                tabIndex={item.onClick ? 0 : undefined}
                onKeyDown={item.onClick ? (event) => {
                  if (event.key === 'Enter' || event.key === ' ') item.onClick?.();
                } : undefined}
              >
                <div className="min-w-0">{item.content}</div>
                {item.actor && <div className="mt-1 text-left text-xs font-semibold leading-relaxed text-text-secondary">{item.actor}</div>}
              </div>
            </TimelineContent>
          </TimelineItem>
        );
      })}
    </Timeline>
  );
}
