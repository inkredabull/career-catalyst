import { buildOutreachPrompt, parseMessageResponse, generateOutreachMessage } from '../src/services/message-generator';

describe('buildOutreachPrompt', () => {
  it('includes contact name and company', () => {
    const prompt = buildOutreachPrompt({ contactName: 'Jane Doe', contactRole: 'VP Eng', company: 'Acme' });
    expect(prompt).toContain('Jane Doe');
    expect(prompt).toContain('Acme');
  });

  it('includes job title when provided', () => {
    const prompt = buildOutreachPrompt({ contactName: 'Jane', contactRole: 'VP', company: 'Co', jobTitle: 'Staff Engineer' });
    expect(prompt).toContain('Staff Engineer');
  });

  it('omits job title line when not provided', () => {
    const prompt = buildOutreachPrompt({ contactName: 'Jane', contactRole: 'VP', company: 'Co' });
    expect(prompt).not.toContain('role');
  });
});

describe('parseMessageResponse', () => {
  it('extracts subject and body from JSON response', () => {
    const raw = 'Here is your message: {"subject": "Hello", "body": "World"}';
    const result = parseMessageResponse(raw);
    expect(result.subject).toBe('Hello');
    expect(result.body).toBe('World');
  });

  it('throws when no JSON found', () => {
    expect(() => parseMessageResponse('no json here')).toThrow('No JSON found');
  });
});

describe('generateOutreachMessage', () => {
  it('calls fetch with Anthropic API and returns parsed message', () => {
    const mockFetch = jest.fn().mockReturnValue({
      getContentText: () => JSON.stringify({
        content: [{ text: '{"subject": "Hi", "body": "Reaching out..."}' }],
      }),
    });

    const result = generateOutreachMessage(
      { contactName: 'Jane', contactRole: 'VP', company: 'Acme' },
      'test-api-key',
      mockFetch
    );

    expect(mockFetch).toHaveBeenCalledWith(
      'https://api.anthropic.com/v1/messages',
      expect.objectContaining({ method: 'post' })
    );
    expect(result.subject).toBe('Hi');
    expect(result.body).toBe('Reaching out...');
  });
});
