import {
  parseVideoChapters,
  parseVideoProposal,
  timestampSeconds,
  youtubeIdFromUrl,
} from './index';

describe('video walkthrough (RS-US chef mode)', () => {
  it('extracts the id from the common YouTube URL forms', () => {
    expect(youtubeIdFromUrl('https://www.youtube.com/watch?v=iV651XRxquM')).toBe('iV651XRxquM');
    expect(youtubeIdFromUrl('https://youtu.be/iV651XRxquM')).toBe('iV651XRxquM');
    expect(youtubeIdFromUrl('https://www.youtube.com/shorts/iV651XRxquM')).toBe('iV651XRxquM');
    expect(youtubeIdFromUrl('https://example.com/nope')).toBeNull();
  });

  it('converts mm:ss and h:mm:ss to seconds', () => {
    expect(timestampSeconds('01:20')).toBe(80);
    expect(timestampSeconds('1:02:03')).toBe(3723);
    expect(timestampSeconds('abc')).toBeNull();
    expect(timestampSeconds('1:2:3:4')).toBeNull();
  });

  it('accepts a proposal, and treats "no confident answer" as a valid outcome', () => {
    expect(parseVideoProposal({ video: { id: 'iV651XRxquM', title: 'Meen kuzhambu' } })).toEqual({
      ok: true,
      video: { video_id: 'iV651XRxquM', title: 'Meen kuzhambu' },
    });
    expect(parseVideoProposal({ video: null })).toEqual({ ok: true, video: null });
  });

  it('accepts a bare URL in place of an id', () => {
    expect(parseVideoProposal({ video: { url: 'https://youtu.be/iV651XRxquM', title: 'x' } })).toEqual(
      { ok: true, video: { video_id: 'iV651XRxquM', title: 'x' } },
    );
  });

  it('rejects a proposal without a valid 11-character id (no invented ids)', () => {
    expect(parseVideoProposal({ video: { id: 'too-short' } }).ok).toBe(false);
    expect(parseVideoProposal({}).ok).toBe(false);
    expect(parseVideoProposal('nope').ok).toBe(false);
  });

  it('parses chapters, and rejects a malformed timestamp or a missing title', () => {
    expect(
      parseVideoChapters({
        chapters: [{ start: '00:12', title: 'Temper the mustard seeds', summary: 'mustard seeds' }],
      }),
    ).toEqual({
      ok: true,
      chapters: [
        { start: '00:12', seconds: 12, title: 'Temper the mustard seeds', summary: 'mustard seeds' },
      ],
    });
    expect(parseVideoChapters({ chapters: [{ start: 'later', title: 'Temper' }] }).ok).toBe(false);
    expect(parseVideoChapters({ chapters: [{ start: '00:12' }] }).ok).toBe(false);
    expect(parseVideoChapters({}).ok).toBe(false);
  });

  it('treats an empty chapter list as valid (the video is not a cook)', () => {
    expect(parseVideoChapters({ chapters: [] })).toEqual({ ok: true, chapters: [] });
  });
});
