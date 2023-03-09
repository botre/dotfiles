local This = {}

local previousApp = ""

function This.switchToAndFromApp(bundleID)
    local focusedWindow = hs.window.focusedWindow()

    if focusedWindow == nil then
        hs.application.launchOrFocusByBundleID(bundleID)
    elseif focusedWindow:application():bundleID() == bundleID then
        if previousApp == nil then
            hs.window.switcher.nextWindow()
        else
            previousApp:activate()
        end
    else
        previousApp = focusedWindow:application()
        hs.application.launchOrFocusByBundleID(bundleID)
    end
end

return This