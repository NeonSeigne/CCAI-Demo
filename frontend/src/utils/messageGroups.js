/**
 * The exchange's main answer: the merged reply, or a data answer (the
 * orchestrator's tool answer). The other advisor messages are the panel's takes.
 */
export const isMainAnswer = (message) => Boolean(message?.is_aggregated) || message?.persona_id === 'orchestrator';

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
      const aggregatedMessages = advisorGroup.filter(isMainAnswer);
      const panelMessages = advisorGroup.filter(m => !isMainAnswer(m));
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
