local am = require('app-management')

-- Hyper
local hyper = require('hyper')
hyper.install('F18')
---- Browser
hyper.bindKey('b', function()
    am.switchToAndFromApp("com.google.chrome")
end)
---- Finder
hyper.bindKey('f', function()
    am.switchToAndFromApp("com.apple.finder")
end)
---- IDE
hyper.bindKey('i', function()
    am.switchToAndFromApp("com.jetbrains.intellij")
end)
---- Terminal
hyper.bindKey('t', function()
    am.switchToAndFromApp("org.alacritty")
end)