local am = require('app-management')

--[[ Hyper ]]
local hyper = require('hyper')
hyper.install('F18')
-- Browser
hyper.bindKey('b', function()
    am.switchToAndFromApp("com.google.chrome")
end)
-- Code editor
hyper.bindKey('c', function()
    am.switchToAndFromApp("com.jetbrains.intellij")
end)
-- Finder
hyper.bindKey('f', function()
    am.switchToAndFromApp("com.apple.finder")
end)
-- Music
hyper.bindKey('m', function()
    am.switchToAndFromApp("com.spotify.client")
end)
-- Terminal
hyper.bindKey('t', function()
    am.switchToAndFromApp("org.alacritty")
end)
-- Tasks ('v' represents a tick)
hyper.bindKey('v', function()
    am.switchToAndFromApp("com.TickTick.task.mac")
end)