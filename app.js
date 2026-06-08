// Local State
let apiKey = localStorage.getItem('gemini_api_key') || '';
let serverUrl = localStorage.getItem('server_url') || 'http://localhost:24848';
let chatHistory = [];
let activeContext = null;
let lastGeneratedCode = '';
let serverStatusInterval = null;
let contextPollInterval = null;
let useActiveContext = true;

// DOM Elements
const chatMessagesContainer = document.getElementById('chat-messages-container');
const promptInput = document.getElementById('prompt-input');
const modelSelect = document.getElementById('model-select');
const sendPromptBtn = document.getElementById('send-prompt-btn');
const clearChatBtn = document.getElementById('clear-chat-btn');

const activeContextBanner = document.getElementById('active-context-banner');
const activeContextPath = document.getElementById('active-context-path');
const ignoreContextBtn = document.getElementById('ignore-context-btn');

const editorTitle = document.getElementById('editor-title');
const codeOutput = document.getElementById('code-output');
const copyCodeBtn = document.getElementById('copy-code-btn');
const syncCodeBtn = document.getElementById('sync-code-btn');
const runCodeBtn = document.getElementById('run-code-btn');

const serverStatusDot = document.querySelector('#server-status .status-dot');
const serverStatusText = document.querySelector('#server-status .val');
const studioStatusDot = document.querySelector('#studio-status .status-dot');
const studioStatusText = document.querySelector('#studio-status .val');

const openSettingsBtn = document.getElementById('open-settings-btn');
const closeSettingsBtn = document.getElementById('close-settings-btn');
const cancelSettingsBtn = document.getElementById('cancel-settings-btn');
const saveSettingsBtn = document.getElementById('save-settings-btn');
const settingsModal = document.getElementById('settings-modal');
const apiKeyInput = document.getElementById('api-key-input');
const serverUrlInput = document.getElementById('server-url-input');
const toggleApiKeyBtn = document.getElementById('toggle-api-key');

// Initialize App
document.addEventListener('DOMContentLoaded', () => {
    // Load stored values into inputs
    apiKeyInput.value = apiKey;
    serverUrlInput.value = serverUrl;

    // Check configuration
    if (!apiKey) {
        showToast('Please set your Gemini API key in settings.', 'info');
        openSettings();
    }

    // Initialize Lucide Icons
    lucide.createIcons();

    // Event Listeners
    sendPromptBtn.addEventListener('click', generateResponse);
    clearChatBtn.addEventListener('click', clearChat);
    copyCodeBtn.addEventListener('click', copyCode);
    syncCodeBtn.addEventListener('click', syncCodeToStudio);
    runCodeBtn.addEventListener('click', runCodeInStudio);
    ignoreContextBtn.addEventListener('click', ignoreContext);

    // Prompt keypress shortcut: Enter to send, Shift+Enter to newline
    promptInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            generateResponse();
        }
    });

    // Settings Modal Listeners
    openSettingsBtn.addEventListener('click', openSettings);
    closeSettingsBtn.addEventListener('click', closeSettings);
    cancelSettingsBtn.addEventListener('click', closeSettings);
    saveSettingsBtn.addEventListener('click', saveSettings);
    toggleApiKeyBtn.addEventListener('click', toggleApiKeyVisibility);

    // Start Polling
    startPolling();
});

// Toast Notification System
function showToast(message, type = 'info') {
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    
    let iconName = 'info';
    if (type === 'success') iconName = 'check-circle';
    if (type === 'error') iconName = 'alert-triangle';

    toast.innerHTML = `
        <i data-lucide="${iconName}"></i>
        <span>${message}</span>
    `;
    container.appendChild(toast);
    lucide.createIcons({attrs: {class: 'toast-icon'}});

    setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transform = 'translateY(-20px)';
        setTimeout(() => toast.remove(), 300);
    }, 4000);
}

// Settings Handlers
function openSettings() {
    settingsModal.classList.remove('hidden');
}

function closeSettings() {
    settingsModal.classList.add('hidden');
}

function toggleApiKeyVisibility() {
    const type = apiKeyInput.getAttribute('type') === 'password' ? 'text' : 'password';
    apiKeyInput.setAttribute('type', type);
    const icon = toggleApiKeyBtn.querySelector('i');
    if (type === 'text') {
        icon.setAttribute('data-lucide', 'eye-off');
    } else {
        icon.setAttribute('data-lucide', 'eye');
    }
    lucide.createIcons();
}

function saveSettings() {
    const inputKey = apiKeyInput.value.trim();
    const inputUrl = serverUrlInput.value.trim() || 'http://localhost:24848';

    localStorage.setItem('gemini_api_key', inputKey);
    localStorage.setItem('server_url', inputUrl);
    
    apiKey = inputKey;
    serverUrl = inputUrl;

    closeSettings();
    showToast('Settings saved successfully!', 'success');

    // Restart Polling with new URL
    startPolling();
}

// Polling and Network Checks
function startPolling() {
    // Clear existing intervals
    if (serverStatusInterval) clearInterval(serverStatusInterval);
    if (contextPollInterval) clearInterval(contextPollInterval);

    checkServerStatus();
    fetchContext();

    // Poll server status every 5 seconds
    serverStatusInterval = setInterval(checkServerStatus, 5000);
    // Poll Roblox context status every 2.5 seconds
    contextPollInterval = setInterval(fetchContext, 2500);
}

async function checkServerStatus() {
    try {
        const response = await fetch(`${serverUrl}/status`, { signal: AbortSignal.timeout(3000) });
        if (response.ok) {
            serverStatusDot.className = 'status-dot connected';
            serverStatusText.textContent = 'Connected';
            return true;
        }
    } catch (err) {
        // Fallback to error status
    }
    serverStatusDot.className = 'status-dot disconnected';
    serverStatusText.textContent = 'Offline';
    studioStatusDot.className = 'status-dot disconnected';
    studioStatusText.textContent = 'Offline';
    return false;
}

async function fetchContext() {
    if (serverStatusText.textContent === 'Offline') return;

    try {
        const response = await fetch(`${serverUrl}/get-context`, { signal: AbortSignal.timeout(2000) });
        if (response.ok) {
            const context = await response.json();
            if (context && context.script_name) {
                activeContext = context;
                
                studioStatusDot.className = 'status-dot connected';
                studioStatusText.textContent = 'Active Selection';

                if (useActiveContext) {
                    activeContextBanner.classList.remove('hidden');
                    activeContextPath.textContent = context.script_path;
                }
            } else {
                activeContext = null;
                studioStatusDot.className = 'status-dot warning';
                studioStatusText.textContent = 'Ready (No Active Selection)';
                activeContextBanner.classList.add('hidden');
            }
        }
    } catch (err) {
        // Silent error
    }
}

function ignoreContext() {
    useActiveContext = false;
    activeContextBanner.classList.add('hidden');
    showToast('Context ignored. Click "Sync" to create a new script instead.', 'info');
}

function clearChat() {
    chatHistory = [];
    chatMessagesContainer.innerHTML = `
        <div class="message system-message">
            <div class="message-content">
                <p>Chat history cleared. Send a message to start a new script context!</p>
            </div>
        </div>
    `;
    showToast('Chat history cleared.', 'info');
}

// API Call to Google Gemini
async function generateResponse() {
    const prompt = promptInput.value.trim();
    if (!prompt) return;

    if (!apiKey) {
        showToast('Please set your Gemini API key in the settings.', 'error');
        openSettings();
        return;
    }

    // Disable input while generating
    promptInput.disabled = true;
    sendPromptBtn.disabled = true;
    const sendBtnText = sendPromptBtn.querySelector('span');
    sendBtnText.textContent = 'Generating...';
    sendPromptBtn.querySelector('.btn-icon-sparkles').classList.add('hidden');
    sendPromptBtn.querySelector('.btn-icon-spinner').classList.remove('hidden');

    // Add User Message
    addChatMessage('user', prompt);
    promptInput.value = '';

    // Build the request body with system instruction
    const selectedModel = modelSelect.value;
    const systemPrompt = `You are a Roblox game development assistant specializing in writing clean, optimized Roblox Luau code.
Always wrap Roblox Lua scripts in \`\`\`lua ... \`\`\` blocks.
Provide explanations in simple terms and add comments directly inside the code to explain complex scripts.
Use modern Roblox best practices:
- Prefer task.wait() over wait()
- Prefer task.spawn() over spawn() or coroutine
- Use Workspace instead of game.Workspace
- Use game:GetService() for all services
- Clean up instances using the Debris service or Destroy()`;

    // Append context to user contents if available
    let promptWithContext = prompt;
    if (useActiveContext && activeContext && activeContext.script_content) {
        promptWithContext = `I am currently editing the Roblox script: "${activeContext.script_path}".
Here is the current code of the script:
\`\`\`lua
${activeContext.script_content}
\`\`\`

My request is: ${prompt}`;
    }

    // Add prompt to history
    chatHistory.push({
        role: 'user',
        parts: [{ text: promptWithContext }]
    });

    try {
        const response = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models/${selectedModel}:generateContent?key=${apiKey}`,
            {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    contents: chatHistory,
                    systemInstruction: {
                        parts: [{ text: systemPrompt }]
                    }
                })
            }
        );

        if (!response.ok) {
            const errData = await response.json();
            throw new Error(errData.error?.message || 'Failed to call Gemini API');
        }

        const resData = await response.json();
        const responseText = resData.candidates?.[0]?.content?.parts?.[0]?.text || 'No response generated.';
        
        // Add to history
        chatHistory.push({
            role: 'model',
            parts: [{ text: responseText }]
        });

        // Add Assistant Message
        addChatMessage('assistant', responseText);
        
        // Extract Luau code and put into viewer
        extractAndDisplayCode(responseText);

    } catch (err) {
        addChatMessage('system', `Error: ${err.message}`);
        showToast(err.message, 'error');
        // Remove failed user prompt from history
        chatHistory.pop();
    } finally {
        // Re-enable inputs
        promptInput.disabled = false;
        sendPromptBtn.disabled = false;
        const sendBtnText = sendPromptBtn.querySelector('span');
        sendBtnText.textContent = 'Generate';
        sendPromptBtn.querySelector('.btn-icon-sparkles').classList.remove('hidden');
        sendPromptBtn.querySelector('.btn-icon-spinner').classList.add('hidden');
    }
}

function addChatMessage(role, text) {
    const msgEl = document.createElement('div');
    msgEl.className = `message ${role}-message`;
    
    const contentEl = document.createElement('div');
    contentEl.className = 'message-content';
    
    if (role === 'system') {
        contentEl.innerHTML = `<p style="color: var(--status-disconnected); font-weight: 600;">${text}</p>`;
    } else {
        // Use marked to parse markdown in messages
        contentEl.innerHTML = marked.parse(text);
        
        // Apply syntax highlight inside messages
        contentEl.querySelectorAll('pre code').forEach((block) => {
            hljs.highlightElement(block);
        });
    }
    
    msgEl.appendChild(contentEl);
    chatMessagesContainer.appendChild(msgEl);
    chatMessagesContainer.scrollTop = chatMessagesContainer.scrollHeight;
}

// Code Extraction Helper
function extractAndDisplayCode(text) {
    // Regex to capture markdown code blocks for lua
    const codeBlockRegex = /```(?:lua|luau|lua-luau)\n([\s\S]*?)```/gi;
    let match;
    let codePieces = [];
    
    while ((match = codeBlockRegex.exec(text)) !== null) {
        codePieces.push(match[1]);
    }
    
    if (codePieces.length > 0) {
        // Join all generated code blocks together
        const finalCode = codePieces.join('\n\n');
        displayCode(finalCode);
        showToast('New Lua script extracted! Ready to sync.', 'success');
    }
}

function displayCode(code) {
    lastGeneratedCode = code;
    codeOutput.textContent = code;
    hljs.highlightElement(codeOutput);
    
    // Update UI Elements
    if (activeContext && useActiveContext) {
        editorTitle.innerHTML = `<i data-lucide="file-code" style="color:var(--accent-blue);"></i> Syncing to: ${activeContext.script_name}`;
    } else {
        editorTitle.innerHTML = `<i data-lucide="file-code" style="color:var(--accent-purple);"></i> Ready to sync (New Script)`;
    }
    
    syncCodeBtn.disabled = false;
    runCodeBtn.disabled = false;
    lucide.createIcons();
}

// Actions
function copyCode() {
    const code = lastGeneratedCode || codeOutput.textContent;
    navigator.clipboard.writeText(code)
        .then(() => showToast('Code copied to clipboard!', 'success'))
        .catch(() => showToast('Failed to copy code.', 'error'));
}

async function syncCodeToStudio() {
    const code = lastGeneratedCode;
    if (!code) return;

    if (serverStatusText.textContent === 'Offline') {
        showToast('Local companion server is offline. Run server.py first!', 'error');
        return;
    }

    // Show syncing state
    syncCodeBtn.disabled = true;
    const syncText = syncCodeBtn.querySelector('span');
    const spinnerIcon = syncCodeBtn.querySelector('.btn-icon-spinner');
    const syncIcon = syncCodeBtn.querySelector('.sync-icon');
    
    syncText.textContent = 'Syncing...';
    syncIcon.classList.add('hidden');
    spinnerIcon.classList.remove('hidden');

    try {
        const response = await fetch(`${serverUrl}/set-pending`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ script: code, action: 'insert' })
        });

        if (response.ok) {
            showToast('Code pushed to local server! Go to Roblox Studio to complete sync.', 'success');
            // Flash green visual indicator
            syncCodeBtn.style.background = 'linear-gradient(135deg, #10b981, #059669)';
            setTimeout(() => {
                syncCodeBtn.style.background = '';
            }, 2000);
        } else {
            throw new Error('Server returned an error');
        }
    } catch (err) {
        showToast(`Sync failed: ${err.message}`, 'error');
    } finally {
        syncCodeBtn.disabled = false;
        syncText.textContent = 'Insert Script';
        syncIcon.classList.remove('hidden');
        spinnerIcon.classList.add('hidden');
    }
}

async function runCodeInStudio() {
    const code = lastGeneratedCode;
    if (!code) return;

    if (serverStatusText.textContent === 'Offline') {
        showToast('Local companion server is offline. Run server.py first!', 'error');
        return;
    }

    // Show executing state
    runCodeBtn.disabled = true;
    const runText = runCodeBtn.querySelector('span');
    const spinnerIcon = runCodeBtn.querySelector('.btn-icon-spinner-run');
    const runIcon = runCodeBtn.querySelector('.run-icon');
    
    runText.textContent = 'Executing...';
    runIcon.classList.add('hidden');
    spinnerIcon.classList.remove('hidden');

    try {
        const response = await fetch(`${serverUrl}/set-pending`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ script: code, action: 'execute' })
        });

        if (response.ok) {
            showToast('Code pushed! Roblox Studio will execute it instantly in Edit Mode.', 'success');
            // Flash purple visual indicator
            runCodeBtn.style.background = 'linear-gradient(135deg, #a855f7, #7c3aed)';
            setTimeout(() => {
                runCodeBtn.style.background = '';
            }, 2000);
        } else {
            throw new Error('Server returned an error');
        }
    } catch (err) {
        showToast(`Execution failed: ${err.message}`, 'error');
    } finally {
        runCodeBtn.disabled = false;
        runText.textContent = 'Run Instantly (Build)';
        runIcon.classList.remove('hidden');
        spinnerIcon.classList.add('hidden');
    }
}
