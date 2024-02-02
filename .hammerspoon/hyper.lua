local This = {
    hyperMode = hs.hotkey.modal.new({}, 'F17')
}

function enterHyperMode()
    This.hyperMode:enter()
end

function exitHyperMode()
    This.hyperMode:exit()
end

-- Utility to bind handler to Hyper+key
function This.bindKey(key, handler)
    This.hyperMode:bind({}, key, handler)
end

-- Utility to bind handler to Hyper+Shift+key
function This.bindShiftKey(key, handler)
    This.hyperMode:bind({ 'shift' }, key, handler)
end

-- Utility to bind handler to Hyper+Command+Shift+key
function This.bindCommandShiftKey(key, handler)
    This.hyperMode:bind({ 'command', 'shift' }, key, handler)
end

-- Utility to bind handler to Hyper+modifiers+key
function This.bindKeyWithModifiers(key, mods, handler)
    This.hyperMode:bind(mods, key, handler)
end

local modifiers = {
    {},
    { 'shift' },
    { 'ctrl' },
    { 'ctrl', 'shift' },
    { 'cmd' },
    { 'cmd', 'shift' },
    { 'cmd', 'ctrl' },
    { 'cmd', 'ctrl', 'shift' },
    { 'alt' },
    { 'alt', 'shift' },
    { 'alt', 'ctrl' },
    { 'alt', 'ctrl', 'shift' },
    { 'alt', 'cmd' },
    { 'alt', 'cmd', 'shift' },
    { 'alt', 'cmd', 'ctrl' },
    { 'alt', 'cmd', 'shift', 'ctrl' }
}

function This.install(hotKey)
    for _, m in ipairs(modifiers) do
        hs.hotkey.bind(m, hotKey, enterHyperMode, exitHyperMode)
    end
end

return This
