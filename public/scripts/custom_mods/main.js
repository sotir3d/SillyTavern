import { saveSettingsDebounced } from "../../script.js";

// --- Configuration & State ---
export const modSettings = {
    user_is_char: false,
    fixed_ai_name_choice: 'none',
    fixed_ai_name_value_one: 'Preset 1',
    fixed_ai_name_value_two: 'Preset 2'
};

// --- Initialization ---
export function initCustomMods() {
    console.log("Initializing Custom Mods...");
    loadModSettings();
    injectUI();
    setupEventListeners();
    setupMessageRendererHook();
}

function loadModSettings() {
    const saved = localStorage.getItem('customModSettings');
    if (saved) {
        Object.assign(modSettings, JSON.parse(saved));
    }
}

function saveModSettings() {
    localStorage.setItem('customModSettings', JSON.stringify(modSettings));
}

// --- UI Injection ---
function injectUI() {
    const html = `
    <div id="custom_toggles_wrapper">
        <div id="custom_toggles_button"><i class="fa-solid fa-chevron-right"></i></div>
        <div id="custom_toggles_container">
            <div class="tooltip">
                <div class="custom-tooltip-icon fa-solid fa-circle-info"></div>
                <span class="tooltiptext">
                    <b>Controls Chat Naming:</b><br><br>
                    • <b>User is AI:</b> Your messages are labeled with the actively selected AI name.<br><br>
                    • <b>{{char}}:</b> Resets to standard behavior (Card Name).<br><br>
                    • <b>Fixed AI Name:</b> The AI's messages and prompt cues use the selected preset.<br><br>
                    • <b>Substitute Strings:</b><br>
                            {{character_card}} is always the active character card.<br>
                            Use {{fixed_name}} and {{fixed_name_2}} substitue strings to access fixed name strings.<br> 
                            {{active_fixed}} is replaced with the actively selected radio button.
                </span>
            </div>
            <div class="inline-flex-item">
                <label for="user_is_char_toggle" class="settings_label">User is AI</label>
                <div class="text_switch">
                    <input id="user_is_char_toggle" type="checkbox" ${modSettings.user_is_char ? 'checked' : ''}>
                    <label for="user_is_char_toggle"></label>
                </div>
            </div>
            <div id="fixed_ai_name_options">
                <div class="fixed-name-option">
                    <input type="radio" id="fixed_ai_name_none" name="fixed_ai_name_choice" value="none" ${modSettings.fixed_ai_name_choice === 'none' ? 'checked' : ''}>
                    <label for="fixed_ai_name_none">{{char}}</label>
                </div>
                <div class="fixed-name-option">
                    <input type="radio" id="fixed_ai_name_one" name="fixed_ai_name_choice" value="one" ${modSettings.fixed_ai_name_choice === 'one' ? 'checked' : ''}>
                    <input id="fixed_ai_name_input_one" class="text_pole" type="text" value="${modSettings.fixed_ai_name_value_one}">
                </div>
                <div class="fixed-name-option">
                    <input type="radio" id="fixed_ai_name_two" name="fixed_ai_name_choice" value="two" ${modSettings.fixed_ai_name_choice === 'two' ? 'checked' : ''}>
                    <input id="fixed_ai_name_input_two" class="text_pole" type="text" value="${modSettings.fixed_ai_name_value_two}">
                </div>
            </div>
        </div>
    </div>`;

    $('body').append(html);

    // Restore panel visibility state
    const isPanelVisible = localStorage.getItem('customTogglesPanelVisible');
    if (isPanelVisible === 'false') {
        $('#custom_toggles_container').addClass('hidden-panel');
        $('#custom_toggles_button i').removeClass('fa-chevron-right').addClass('fa-chevron-left');
    }
}

function setupEventListeners() {
    // Panel Toggle
    $('#custom_toggles_button').on('click', function() {
        const panel = $('#custom_toggles_container');
        panel.toggleClass('hidden-panel');
        $(this).find('i').toggleClass('fa-chevron-right fa-chevron-left');
        localStorage.setItem('customTogglesPanelVisible', panel.hasClass('hidden-panel') ? 'false' : 'true');
    });

    // Settings Changes
    $('#user_is_char_toggle').on('change', function() {
        modSettings.user_is_char = $(this).is(':checked');
        saveModSettings();
    });

    $('input[name="fixed_ai_name_choice"]').on('change', function() {
        modSettings.fixed_ai_name_choice = $(this).val();
        saveModSettings();
    });

    $('#fixed_ai_name_input_one, #fixed_ai_name_input_two').on('input', function() {
        modSettings.fixed_ai_name_value_one = $('#fixed_ai_name_input_one').val();
        modSettings.fixed_ai_name_value_two = $('#fixed_ai_name_input_two').val();
        saveModSettings();
    });
}

// --- Message Toolbar Logic (Moves buttons to bottom) ---
function setupMessageRendererHook() {
    // We observe the chat container for new nodes to manipulate DOM without editing HTML templates
    const observer = new MutationObserver((mutations) => {
        mutations.forEach((mutation) => {
            mutation.addedNodes.forEach((node) => {
                if (node.nodeType === 1 && node.classList.contains('mes')) {
                    rearrangeMessageLayout($(node));
                }
            });
        });
    });
    
    const chatElement = document.getElementById('chat');
    if (chatElement) {
        observer.observe(chatElement, { childList: true });
    }
}

function rearrangeMessageLayout(messageElement) {
    // Don't process if already processed
    if (messageElement.find('.mes_footer').length > 0) return;

    const buttons = messageElement.find('.mes_buttons');
    const editButtons = messageElement.find('.mes_edit_buttons');
    const mesBlock = messageElement.find('.mes_block');

    // Create Footer
    const footer = $('<div class="mes_footer"></div>');
    
    // Move buttons into footer
    footer.append(buttons);
    footer.append(editButtons);
    
    // Append footer to the block
    mesBlock.append(footer);
}


// --- Hooks for Script.js ---

/** Returns the effective name for the AI based on radio buttons. */
export function getActiveAiName(defaultName) {
    if (modSettings.fixed_ai_name_choice === 'one') return modSettings.fixed_ai_name_value_one;
    if (modSettings.fixed_ai_name_choice === 'two') return modSettings.fixed_ai_name_value_two;
    return defaultName;
}

/** Returns the effective User name based on toggles. */
export function getActiveUserName(realUserName, defaultAiName) {
    if (modSettings.user_is_char) {
        return getActiveAiName(defaultAiName);
    }
    return realUserName;
}

/** Injects custom macros into the environment object. */
export function injectCustomMacros(environment) {
    // {{fixed_name}} -> Always Preset 1
    environment.fixed_name = modSettings.fixed_ai_name_value_one || '';
    
    // {{active_fixed}} -> Currently selected preset (or char name if default)
    // We can't access 'name2' directly here easily, so we rely on the caller passing replacements,
    // or we resolve it dynamically. 
    // To simplify: if 'none', we return the value of {{char}} via the environment itself if possible, 
    // but environment.char is a string.
    
    environment.active_fixed = getActiveAiName(environment.char);
}

/** Returns true if we should forbid the AI from writing {{char}} name. */
export function shouldStopOnCharName() {
    return modSettings.user_is_char || modSettings.fixed_ai_name_choice !== 'none';
}

/** 
 * Modifies the substituteParams options to force {{char}} and {{user}} 
 * to resolve to the fixed names selected in the UI.
 */
export function applyNameOverrides(options, defaultName1, defaultName2) {
    // 1. Resolve {{char}}
    // If a fixed AI name is selected (not 'none'), use it. 
    // Otherwise fall back to the provided override or the global default.
    const activeAiName = getActiveAiName(options.name2Override ?? defaultName2);
    
    // Force the macro engine to use this name for {{char}}
    options.name2Override = activeAiName;

    // 2. Resolve {{user}}
    // If "User is Char" is on, use the Active AI Name (calculated above).
    // Otherwise use the provided override or global default.
    const currentUserName = options.name1Override ?? defaultName1;
    if (modSettings.user_is_char) {
        options.name1Override = activeAiName;
    } else {
        options.name1Override = currentUserName;
    }
}

/** 
 * Returns an object containing the custom macros to inject into the replacement engine.
 * @param {string} originalCharName - The real name of the character card (name2).
 */
export function getCustomMacros(originalCharName) {
    return {
        // {{fixed_name}}: Always Preset 1
        fixed_name: modSettings.fixed_ai_name_value_one || '',
        
        // {{fixed_name_2}}: Always Preset 2
        fixed_name_2: modSettings.fixed_ai_name_value_two || '',
        
        // {{active_fixed}}: The currently selected radio option (Preset 1, 2, or Char Name)
        active_fixed: getActiveAiName(originalCharName),
        
        // {{character_card}}: Always the original character card name
        character_card: originalCharName
    };
}

// --- State Tracking ---
let skipNextBranching = false;
let retryButtonTracker = null;

// --- UI Injection ---

/**
 * Injects a free-floating Retry button attached to the body.
 * Pins to the right of the Send OR Stop button (whichever is active).
 */
export function injectRetryButton() {
    // Prevent duplicates
    if ($('#retry_branch_button').length) return;

    // 1. Create the button
    const btn = $(`
        <div id="retry_branch_button" title="Retry Branch: Interrupt, Revert this swipe to the previous state, and Continue.">
            <i class="fa-solid fa-sync"></i>
        </div>
    `);

    // 2. CSS Styling
    btn.css({
        'position': 'fixed',
        'z-index': '9999',
        'cursor': 'pointer',
        'display': 'none',
        'align-items': 'center',
        'justify-content': 'center',
        'width': '40px',        // Increased from 35px
        'height': '40px',       // Increased from 35px
        'opacity': '0.5',
        'font-size': '1.4em',   // Increased from 1.0em
        'color': 'var(--SmartThemeBodyColor)',
        'transition': 'opacity 0.2s, top 0.1s, left 0.1s' // Smooth movement
    });

    // Hover effect
    btn.hover(
        function() { $(this).css('opacity', '1'); }, 
        function() { $(this).css('opacity', '0.5'); }
    );

    btn.on('click', triggerRetryBranch);

    // 3. Append to Body
    $('body').append(btn);

    // 4. Position Tracker
    const updatePosition = () => {
        // Detect which button is currently the main action button
        // During generation, #send_but is hidden and #mes_stop is shown
        let anchor = $('#send_but');
        if (!anchor.is(':visible')) {
            anchor = $('#mes_stop');
        }

        // If neither is visible (e.g. full immersive mode or hidden UI), hide this too
        if (!anchor.is(':visible')) {
            btn.css('display', 'none');
            return;
        }

        const rect = anchor[0].getBoundingClientRect();
        
        // Position: Right side of Anchor + 10px padding
        const leftPos = rect.right + 10;
        
        // Center vertically relative to the anchor button
        const topPos = rect.top + (rect.height / 2) - (40 / 2); // 40 is btn.height

        btn.css({
            'display': 'flex',
            'left': leftPos + 'px',
            'top': topPos + 'px'
        });
    };

    // Run tracker loop
    updatePosition();
    if (window.retryButtonTracker) clearInterval(window.retryButtonTracker);
    window.retryButtonTracker = setInterval(updatePosition, 50); // Faster update for smoother Stop/Send swap
    $(window).on('resize', updatePosition);
}

// --- Logic ---

/**
 * Handles the "Overwrite Next Swipe" branching logic for Continue mode.
 */
export function handleContinueBranching(chat, chat_metadata, { ensureSwipes, syncMesToSwipe }) {
    if (skipNextBranching) {
        console.debug("[Custom Mod] Branching skipped due to Retry action.");
        skipNextBranching = false;
        return;
    }

    if (!chat || chat.length === 0) return;

    const lastMesId = chat.length - 1;
    const lastMsg = chat[lastMesId];

    ensureSwipes(lastMsg);
    syncMesToSwipe(lastMesId);

    const currentIdx = lastMsg.swipe_id;
    const nextIdx = currentIdx + 1;

    const sourceText = lastMsg.swipes[currentIdx];
    const sourceInfo = structuredClone(lastMsg.swipe_info[currentIdx]);

    if (nextIdx < lastMsg.swipes.length) {
        lastMsg.swipes[nextIdx] = sourceText;
        lastMsg.swipe_info[nextIdx] = sourceInfo;
    } else {
        lastMsg.swipes.push(sourceText);
        lastMsg.swipe_info.push(sourceInfo);
    }

    lastMsg.swipe_id = nextIdx;
    chat_metadata['tainted'] = true;
}

/**
 * Retries the CURRENT swipe by overwriting it with the PREVIOUS swipe's text.
 * Interrupts generation if active.
 */
export async function triggerRetryBranch() {
    // 1. Interrupt Logic
    if ($('#mes_stop').is(':visible')) {
        $('#mes_stop').trigger('click');
        await new Promise(resolve => setTimeout(resolve, 200));
    }

    const context = window.SillyTavern.getContext();
    const chat = context.chat;
    
    if (!chat || chat.length === 0) return;

    const lastId = chat.length - 1;
    const msg = chat[lastId];

    if (!msg || (msg.swipe_id || 0) <= 0) {
        if (window.toastr) window.toastr.info("No previous swipe to branch from.");
        return;
    }

    const previousIndex = msg.swipe_id - 1;
    const sourceText = msg.swipes[previousIndex];
    const sourceInfo = structuredClone(msg.swipe_info[previousIndex]);

    msg.swipes[msg.swipe_id] = sourceText;
    msg.swipe_info[msg.swipe_id] = sourceInfo;
    
    msg.mes = sourceText;

    const domMsg = document.querySelector(`.mes[mesid="${lastId}"] .mes_text`);
    if (domMsg) {
        domMsg.innerText = sourceText; 
    }

    skipNextBranching = true;
    $('#option_continue').trigger('click');
}

// --- Streaming Hooks ---

export function initStreamingLock(processor, chat) {
    const lastMsg = chat[chat.length - 1];
    processor.lockedSwipeId = lastMsg ? (lastMsg.swipe_id ?? 0) : 0;
}

export function updateLockedSwipe(processor, chat, messageId, text) {
    if (!chat[messageId]) return;
    if (Array.isArray(chat[messageId].swipes)) {
        chat[messageId].swipes[processor.lockedSwipeId] = text;
        if (chat[messageId].swipe_info && chat[messageId].swipe_info[processor.lockedSwipeId]) {
            chat[messageId].swipe_info[processor.lockedSwipeId].extra = structuredClone(chat[messageId].extra || {});
        }
    }
}

export function shouldUpdateDom(processor, chat, messageId) {
    if (!chat[messageId]) return false;
    return chat[messageId].swipe_id === processor.lockedSwipeId;
}

// Auto-run injection
$(document).ready(() => {
    // Wait a moment for ST to load fully
    setTimeout(injectRetryButton, 2000);
});