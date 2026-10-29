/**
 * Groups consecutive advisor messages so a view can show each exchange's
 * answers together: [{type: 'advisor_group', responseGroupId, messages,
 * panelMessages, aggregatedMessages} | {type: 'single', message}].
 */
export default function groupMessages(messages) {
  const groups = [];
  let i = 0;
  while (i < messages.length) {
    if (messages[i].type === 'advisor') {
      const advisorGroup = [];
      while (i < messages.length && messages[i].type === 'advisor') {
        advisorGroup.push(messages[i]);
        i++;
      }
      const aggregatedMessages = advisorGroup.filter(m => m.is_aggregated);
      const panelMessages = advisorGroup.filter(m => !m.is_aggregated);
      // Prefer the shared responseGroupId from non-aggregated messages;
      // aggregated messages appended to the DB can land after a later
      // exchange's advisors, so they must not pollute that group's key.
      const responseGroupId =
        advisorGroup.find(m => m.responseGroupId && !m.is_aggregated)?.responseGroupId ||
        `legacy_${advisorGroup.map(m => m.id).join('_')}`;
      groups.push({
        type: 'advisor_group',
        responseGroupId,
        messages: advisorGroup,
        panelMessages,
        aggregatedMessages,
      });
    } else {
      groups.push({ type: 'single', message: messages[i] });
      i++;
    }
  }
  return groups;
}

/** The chat box's one placeholder, everywhere (design D12). */
export const chatPlaceholder = (config) => config?.chat_page?.placeholder || 'Ask about courses, events or places';
