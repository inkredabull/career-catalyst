export interface OutreachContext {
    contactName: string;
    contactRole: string;
    company: string;
    jobTitle?: string;
    notes?: string;
}
export interface GeneratedMessage {
    subject: string;
    body: string;
}
export type FetchFn = (url: string, options: object) => {
    getContentText(): string;
};
export declare function buildOutreachPrompt(ctx: OutreachContext): string;
export declare function parseMessageResponse(responseText: string): GeneratedMessage;
export declare function generateOutreachMessage(ctx: OutreachContext, apiKey: string, fetchFn: FetchFn): GeneratedMessage;
//# sourceMappingURL=message-generator.d.ts.map