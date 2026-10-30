// User Guide content. Content can be overridden per-application by replacing
// these strings with values pulled from the backend config in the future.
// Use {{appName}} as a placeholder. It gets replaced at render time.

export const userGuideTopics = [
  {
    id: 'getting-started',
    title: 'Getting Started',
    icon: 'Sparkles',
    content: `# Welcome to {{appName}}

{{appName}} is your AI-powered academic guidance system. A panel of specialized AI advisors gives you diverse perspectives on your research, writing, methodology, and more.

## Your first steps
1. **Start a new chat** using the pencil icon next to the search bar
2. **Type a question.** Anything about your research, methodology, or PhD journey
3. **Read multiple advisor responses.** Each persona brings a different lens
4. **Reply to a specific advisor** to dig deeper into their perspective

## Need help?
You can return to this guide anytime by clicking the **?** icon in the header.`,
  },
  {
    id: 'documents',
    title: 'Uploading Documents',
    icon: 'Paperclip',
    content: `# Uploading Documents

You can attach **PDFs, Word documents, and text files** to give your advisors context.

## How it works
1. Click the paperclip icon in the chat input
2. Select your file
3. Wait for it to process
4. Ask a question, and your advisors will reference the document

## What can it handle?
- Research papers (PDF)
- Drafts and chapters (DOCX, TXT)
- Notes and outlines

## Behind the scenes
Documents are processed using **RAG (retrieval-augmented generation)**. The system finds the most relevant chunks of your document for each question, so even long documents work well.`,
  },
  {
    id: 'sessions',
    title: 'Sessions & History',
    icon: 'forum',
    content: `# Sessions & History

Every conversation is automatically saved as a session.

## Finding past chats
Use the **search bar** in the sidebar to filter your past sessions by title.

## Switching between sessions
Click any session in the sidebar to return to it. Your full context is preserved.

## Starting a new chat
Click the pencil/edit icon next to the search bar to start a fresh conversation.

## Renaming or deleting
Hover any session to reveal the **menu**. From there you can rename or delete.`,
  },
  {
    id: 'tips',
    title: 'Tips & Shortcuts',
    icon: 'Sparkles',
    content: `# Tips & Shortcuts

## Get better answers
- **Provide context.** Mention your field, your stage, your specific concern.
- **Quote your work.** Paste a paragraph from your draft for targeted feedback.
- **Use multiple advisors.** Ask one for theory, another for practical next steps.

## Useful workflows
- **Stuck on methodology?** Ask the Methodologist + Theorist together.
- **Feeling burnt out?** The Motivational Coach + Empathetic Listener help reframe.
- **Need to be challenged?** Talk to the Constructive Critic and Socratic Mentor.

## Theme
Switch between light and dark mode using the toggle in the top right.`,
  },
];
