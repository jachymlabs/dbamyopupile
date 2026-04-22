import sanitizeHtmlLib from 'sanitize-html';

export function sanitizeHtml(html: string): string {
    if (!html) return '';
    return sanitizeHtmlLib(html, {
        allowedTags: sanitizeHtmlLib.defaults.allowedTags.concat(['img', 'h1', 'h2']),
        allowedAttributes: {
            ...sanitizeHtmlLib.defaults.allowedAttributes,
            img: ['src', 'alt', 'width', 'height', 'loading'],
        },
        allowedSchemes: ['http', 'https'],
    });
}
