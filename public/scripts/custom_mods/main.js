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
                    • <b>User is Char:</b> Your messages are labeled with the selected AI name.<br><br>
                    • <b>Fixed AI Name:</b> The AI's messages and prompt cues use the selected preset.<br><br>
                    • <b>Default:</b> Resets to standard behavior (Card Name).
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
 * Handles the "Overwrite Next Swipe" branching logic for Continue mode.
 * @param {Array} chat - The global chat array.
 * @param {Object} chat_metadata - The global chat metadata object.
 * @param {Object} helpers - Object containing ensureSwipes and syncMesToSwipe functions.
 */
export function handleContinueBranching(chat, chat_metadata, { ensureSwipes, syncMesToSwipe }) {
    // Safety checks
    if (!chat || chat.length === 0) return;

    const lastMesId = chat.length - 1;
    const lastMsg = chat[lastMesId];

    // 1. Ensure internal data structures exist using the passed helper
    ensureSwipes(lastMsg);

    // 2. Save manual edits to CURRENT swipe before copying
    syncMesToSwipe(lastMesId);

    const currentIdx = lastMsg.swipe_id;
    const nextIdx = currentIdx + 1;

    // 3. Prepare the data (Clone current swipe)
    const sourceText = lastMsg.swipes[currentIdx];
    // structuredClone breaks the reference so we don't edit the history
    const sourceInfo = structuredClone(lastMsg.swipe_info[currentIdx]);

    // 4. Branching Logic
    if (nextIdx < lastMsg.swipes.length) {
        // CASE A: Next swipe exists. Overwrite it.
        // This preserves history (previous swipes) but allows "redo" of the specific branch ahead.
        lastMsg.swipes[nextIdx] = sourceText;
        lastMsg.swipe_info[nextIdx] = sourceInfo;
        console.debug(`[Custom Mod] Overwrote swipe ${nextIdx} for continue branching.`);
    } else {
        // CASE B: End of stack. Create new.
        lastMsg.swipes.push(sourceText);
        lastMsg.swipe_info.push(sourceInfo);
        console.debug(`[Custom Mod] Created new swipe ${nextIdx} for continue branching.`);
    }

    // 5. Advance the pointer
    lastMsg.swipe_id = nextIdx;

    // 6. Taint metadata so SillyTavern knows to save to disk
    chat_metadata['tainted'] = true;
}