local am = require('app-management')

-- # Hyper
local hyper = require('hyper')
hyper.install('F18')

-- ## Applications
for _, item in ipairs({
    { key = 'b', description = 'Browser', application = "com.microsoft.edgemac" },
    { key = 'c', description = 'Code editor', application = "com.jetbrains.intellij" },
    { key = 'f', description = 'Finder', application = "com.apple.finder" },
    { key = 'm', description = 'Music', application = "com.spotify.client" },
    { key = 'p', description = 'Password manager', application = "com.1password.1password" },
    { key = 't', description = 'Terminal', application = "org.alacritty" },
    { key = 'v', description = 'Tasks', application = "com.TickTick.task.mac" },
}) do
    print('Binding ' .. item.description .. ' to Hyper+' .. item.key)
    hyper.bindKey(item.key, function()
        am.switchToAndFromApp(item.application)
    end)
end

-- ## Utilities
-- Space to click
hyper.bindKey('space', function()
    hs.eventtap.leftClick(hs.mouse.getAbsolutePosition())
end)