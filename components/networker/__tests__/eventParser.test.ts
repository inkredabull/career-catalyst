import { describe, it, expect } from 'vitest';
import { parseEventFromFileName, getEventPhase } from '../src/eventParser.js';

describe('parseEventFromFileName', () => {
  it('parses eventName and eventDate from an underscore-separated date', () => {
    const info = parseEventFromFileName('Agent Builders Night on 8_25_26.csv');
    expect(info.eventName).toBe('Agent Builders Night on 8/25/26');
    expect(info.eventDate).toBeInstanceOf(Date);
    expect(info.eventDate?.getFullYear()).toBe(2026);
    expect(info.eventDate?.getMonth()).toBe(7); // August = index 7
    expect(info.eventDate?.getDate()).toBe(25);
  });

  it('parses eventDate from a dash-separated date', () => {
    const info = parseEventFromFileName('Agent Builders Night on 8-25-26.csv');
    expect(info.eventDate?.getFullYear()).toBe(2026);
    expect(info.eventDate?.getMonth()).toBe(7);
    expect(info.eventDate?.getDate()).toBe(25);
  });

  it('restores colons from macOS/Chrome-saved underscores', () => {
    const info = parseEventFromFileName('Meetup_ Founders Night on 8_25_26.csv');
    expect(info.eventName).toBe('Meetup: Founders Night on 8/25/26');
  });

  it('leaves eventDate undefined when no date pattern is present', () => {
    const info = parseEventFromFileName('Some Random File.csv');
    expect(info.eventName).toBe('Some Random File');
    expect(info.eventDate).toBeUndefined();
  });

  it('leaves eventDate undefined for an impossible date', () => {
    const info = parseEventFromFileName('Weird Event on 13_45_26.csv');
    expect(info.eventDate).toBeUndefined();
  });
});

describe('getEventPhase', () => {
  const today = new Date(2026, 7, 25); // Aug 25, 2026

  it('returns "before" when eventDate is after today', () => {
    expect(getEventPhase(new Date(2026, 7, 26), today)).toBe('before');
  });

  it('returns "before" when eventDate is the same calendar day, regardless of time', () => {
    const eventDate = new Date(2026, 7, 25, 23, 59);
    const now = new Date(2026, 7, 25, 0, 1);
    expect(getEventPhase(eventDate, now)).toBe('before');
  });

  it('returns "after" when eventDate is before today', () => {
    expect(getEventPhase(new Date(2026, 7, 24), today)).toBe('after');
  });

  it('returns "after" when eventDate is undefined', () => {
    expect(getEventPhase(undefined, today)).toBe('after');
  });

  it('classifies a far-future date as "before"', () => {
    expect(getEventPhase(new Date(2030, 0, 1), today)).toBe('before');
  });

  it('classifies a far-past date as "after"', () => {
    expect(getEventPhase(new Date(2020, 0, 1), today)).toBe('after');
  });
});
