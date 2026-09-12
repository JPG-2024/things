export const DEFAULT_TEMPLATE_ID = 'default';
export const INITIAL_TEMPLATE_ID = 'initial';

export function isRealTemplateId(id: string | null | undefined): id is string {
	return (
		typeof id === 'string' &&
		id.length > 0 &&
		id !== DEFAULT_TEMPLATE_ID &&
		id !== INITIAL_TEMPLATE_ID
	);
}
