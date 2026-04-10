import { saveSettingsDebounced, updateMessageBlock } from "../../script.js";

// --- Configuration & State ---
export const modSettings = {
    custom_user_name_enabled: false,
    custom_user_name_value: '',
    fixed_ai_name_choice: 'none',
    fixed_ai_name_value_one: 'Preset 1',
    fixed_ai_name_value_two: 'Preset 2',
    use_bias_for_char: true,
    use_bias_for_one: true,
    use_bias_for_two: true
};

// --- Initialization ---
export function initCustomMods() {
    console.log("Initializing Custom Mods...");
    loadModSettings();
    injectUI();
    setupEventListeners();
    setupMessageRendererHook();
    // Defer the PromptReasoning patch via dynamic import. We can't statically
    // import reasoning.js from here because main.js is the first import in
    // script.js, which would force reasoning.js to evaluate before script.js
    // has bound its own re-exports (eventSource/event_types), and reasoning.js
    // has top-level eventSource.on() calls that would crash on undefined.
    patchPromptReasoningClearLatest();
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
                    • <b>Custom User Name:</b> When toggled on, the text field value is used as {{user}} instead of the default name.<br><br>
                    • <b>{{char}}:</b> Resets to standard behavior (Card Name).<br><br>
                    • <b>Fixed AI Name:</b> The AI's messages and prompt cues use the selected preset.<br><br>
                    • <b>Prefix Checkbox:</b> The checkbox on each option controls whether "Start Reply With" is used when that option is active.<br><br>
                    • <b>Substitute Strings:</b><br>
                            {{character_card}} is always the active character card.<br>
                            Use {{fixed_name}} and {{fixed_name_2}} substitue strings to access fixed name strings.<br>
                            {{active_fixed}} is replaced with the actively selected radio button.
                </span>
            </div>
            <div class="inline-flex-item">
                <label for="custom_user_name_toggle" class="settings_label">Custom User</label>
                <div class="text_switch">
                    <input id="custom_user_name_toggle" type="checkbox" ${modSettings.custom_user_name_enabled ? 'checked' : ''}>
                    <label for="custom_user_name_toggle"></label>
                </div>
            </div>
            <div class="inline-flex-item">
                <input id="custom_user_name_input" class="text_pole" type="text" placeholder="{{user}} name" value="${modSettings.custom_user_name_value}">
            </div>
            <div id="fixed_ai_name_options">
                <div class="fixed-name-option">
                    <input type="radio" id="fixed_ai_name_none" name="fixed_ai_name_choice" value="none" ${modSettings.fixed_ai_name_choice === 'none' ? 'checked' : ''}>
                    <label for="fixed_ai_name_none">{{char}}</label>
                    <input type="checkbox" id="use_bias_for_char" class="bias-checkbox" title="Use 'Start Reply With' prefix" ${modSettings.use_bias_for_char ? 'checked' : ''}>
                </div>
                <div class="fixed-name-option">
                    <input type="radio" id="fixed_ai_name_one" name="fixed_ai_name_choice" value="one" ${modSettings.fixed_ai_name_choice === 'one' ? 'checked' : ''}>
                    <input id="fixed_ai_name_input_one" class="text_pole" type="text" value="${modSettings.fixed_ai_name_value_one}">
                    <input type="checkbox" id="use_bias_for_one" class="bias-checkbox" title="Use 'Start Reply With' prefix" ${modSettings.use_bias_for_one ? 'checked' : ''}>
                </div>
                <div class="fixed-name-option">
                    <input type="radio" id="fixed_ai_name_two" name="fixed_ai_name_choice" value="two" ${modSettings.fixed_ai_name_choice === 'two' ? 'checked' : ''}>
                    <input id="fixed_ai_name_input_two" class="text_pole" type="text" value="${modSettings.fixed_ai_name_value_two}">
                    <input type="checkbox" id="use_bias_for_two" class="bias-checkbox" title="Use 'Start Reply With' prefix" ${modSettings.use_bias_for_two ? 'checked' : ''}>
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
    $('#custom_user_name_toggle').on('change', function() {
        modSettings.custom_user_name_enabled = $(this).is(':checked');
        saveModSettings();
    });

    $('#custom_user_name_input').on('input', function() {
        modSettings.custom_user_name_value = $(this).val();
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

    $('.bias-checkbox').on('change', function() {
        modSettings[$(this).attr('id')] = $(this).is(':checked');
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
    if (modSettings.custom_user_name_enabled && modSettings.custom_user_name_value) {
        return modSettings.custom_user_name_value;
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

/** Returns true if the "Start Reply With" prefix should be used for the currently selected name option. */
export function shouldIncludePromptBias() {
    if (modSettings.fixed_ai_name_choice === 'one') return modSettings.use_bias_for_one;
    if (modSettings.fixed_ai_name_choice === 'two') return modSettings.use_bias_for_two;
    return modSettings.use_bias_for_char;
}

/** Returns true if we should forbid the AI from writing {{char}} name. */
export function shouldStopOnCharName() {
    return modSettings.fixed_ai_name_choice !== 'none';
}

/** 
 * Modifies the substituteParams options to force {{char}} and {{user}} 
 * to resolve to the fixed names selected in the UI.
 */
export function applyNameOverrides(options, defaultName1, defaultName2) {
    // 1. Resolve {{char}}
    // FIX: We no longer override name2Override here.
    // This allows {{char}} to retain the original character card name 
    // so it doesn't overwrite the character's description!
    
    // 2. Resolve {{user}}
    // If custom user name is enabled and has a value, use it.
    // Otherwise use the provided override or global default.
    const currentUserName = options.name1Override ?? defaultName1;
    if (modSettings.custom_user_name_enabled && modSettings.custom_user_name_value) {
        options.name1Override = modSettings.custom_user_name_value;
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

    // Restore the full message state from the previous swipe, not just the text.
    // Without this, msg.extra (including extra.reasoning) still holds the CURRENT
    // swipe's data, so the subsequent continue treats the retry as a continuation
    // of the current swipe rather than the previous one. This is especially broken
    // for thinking-only swipes, where extra.reasoning is the entire payload.
    msg.mes = sourceText;
    if (sourceInfo) {
        if (sourceInfo.extra) {
            msg.extra = structuredClone(sourceInfo.extra);
        }
        if (sourceInfo.send_date !== undefined) msg.send_date = sourceInfo.send_date;
        if (sourceInfo.gen_started !== undefined) msg.gen_started = sourceInfo.gen_started;
        if (sourceInfo.gen_finished !== undefined) msg.gen_finished = sourceInfo.gen_finished;
    }

    // Re-render the message so the message text and reasoning UI both reflect
    // the restored previous-swipe state before continue kicks in.
    updateMessageBlock(lastId, msg);

    skipNextBranching = true;
    $('#option_continue').trigger('click');
}

// --- Reasoning prefix preservation on stop ---
//
// When the user clicks Stop while generation is continuing on a thinking-only
// message, the upstream flow has the following ordering problem:
//   1. stopGeneration() emits GENERATION_ENDED + GENERATION_STOPPED, which
//      synchronously call PromptReasoning.clearLatest() and wipe #LATEST.
//   2. The streaming loop then unwinds asynchronously, and cleanUpMessage()
//      runs. It checks `!PromptReasoning.getLatestPrefix()` to decide whether
//      it is safe to trim leading/trailing whitespace from the new tokens.
//   3. Because #LATEST is already cleared, the check passes and the leading
//      space of the newly streamed reasoning text gets trimmed away.
//
// Fix: temporarily suppress PromptReasoning.clearLatest() around the stop
// click so the prefix safeguard in cleanUpMessage still kicks in. We use a
// capture-phase listener so the flag is set before the bubble-phase
// stopGeneration() handler runs (which is what fires both events).
//
// However, the suppression must NOT extend into the MESSAGE_RECEIVED event
// that fires later in finalizeIntermediaryMessage. The reasoning handler
// (reasoning.js:1446) calls getLatestPrefix() there to decide whether to
// re-parse the message. If #LATEST is still alive with prefixIncomplete=true,
// it prepends the thinking prefix to message.mes, fails to find a closing
// </think> tag, and writes the concatenated thinking+message text back as mes.
//
// Solution: use eventSource.makeFirst(MESSAGE_RECEIVED) to clear the
// suppression and call the real clearLatest() right before the reasoning
// handler runs. This gives us the correct behavior at both call sites:
//   - cleanUpMessage (in onProgressStreaming) sees the prefix → no trim ✓
//   - MESSAGE_RECEIVED handler sees no prefix → no destructive re-parse ✓
async function patchPromptReasoningClearLatest() {
    let PromptReasoning;
    let eventSource, event_types;
    try {
        // Dynamic import: avoids forcing reasoning.js to evaluate during the
        // static import phase of main.js, which would happen before script.js
        // has had a chance to bind its eventSource/event_types re-exports.
        ({ PromptReasoning } = await import("../reasoning.js"));
        ({ eventSource, event_types } = await import("../../script.js"));
    } catch (err) {
        console.warn("[Custom Mod] Failed to import PromptReasoning for clearLatest patch:", err);
        return;
    }
    if (!PromptReasoning || typeof PromptReasoning.clearLatest !== 'function') return;
    if (PromptReasoning.__customModClearLatestPatched) return;
    PromptReasoning.__customModClearLatestPatched = true;

    let suppressClearLatest = false;
    const originalClearLatest = PromptReasoning.clearLatest.bind(PromptReasoning);

    PromptReasoning.clearLatest = function () {
        if (suppressClearLatest) return;
        return originalClearLatest();
    };

    const disarmAndClear = () => {
        if (!suppressClearLatest) return;
        suppressClearLatest = false;
        originalClearLatest();
    };

    const armSuppression = () => {
        suppressClearLatest = true;
        // Fallback: if MESSAGE_RECEIVED never fires (error paths, impersonate),
        // clear the suppression after a generous window so it doesn't leak.
        setTimeout(disarmAndClear, 2000);
    };

    // Lift suppression BEFORE the reasoning handler's MESSAGE_RECEIVED listener
    // re-parses the message. The reasoning handler (reasoning.js:1446) prepends
    // getLatestPrefix() to message.mes and re-parses; if #LATEST is still alive
    // with prefixIncomplete=true, the prefix+mes concatenation has no closing
    // </think> tag, so the parse fails and the raw thinking text overwrites mes.
    //
    // Order in finalizeIntermediaryMessage:
    //   1. onProgressStreaming(final) → cleanUpMessage → getLatestPrefix() [needs prefix]
    //   2. ... finish / sync ...
    //   3. emit MESSAGE_RECEIVED → reasoning handler → getLatestPrefix() [must be empty]
    //
    // makeFirst ensures we run at step 3 before the reasoning handler.
    eventSource.makeFirst(event_types.MESSAGE_RECEIVED, disarmAndClear);

    // Safety: also clear on chat change so suppression never leaks across chats.
    eventSource.makeFirst(event_types.CHAT_CHANGED, disarmAndClear);

    document.addEventListener('click', function (e) {
        const target = e.target;
        if (target && typeof target.closest === 'function' && target.closest('#mes_stop')) {
            armSuppression();
        }
    }, true); // capture phase, runs before the jQuery delegated handler
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