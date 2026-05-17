-- Hyprland config (Lua) -- requires Hyprland >= 0.55.
-- Migrated from GNOME; mirrors scripts/gnome where an equivalent exists.
-- Docs: https://wiki.hypr.land  -  Lua move: https://hypr.land/news/26_lua/

----------------
--- PROGRAMS ---
----------------
local terminal = "ghostty"
local menu     = "fuzzel"
local browser  = "firefox"
local mainMod  = "SUPER"

----------------
--- MONITORS ---
----------------
hl.monitor({ output = "", mode = "preferred", position = "auto", scale = "auto" })

-----------------
--- AUTOSTART ---
-----------------
hl.on("hyprland.start", function()
    hl.exec_cmd("waybar")
    hl.exec_cmd("mako")
    hl.exec_cmd("/usr/lib/hyprpolkit-agent/hyprpolkit-agent")
    hl.exec_cmd("hypridle")
    hl.exec_cmd("nm-applet --indicator")
    hl.exec_cmd("blueman-applet")
    hl.exec_cmd("wl-paste --watch cliphist store")
    hl.exec_cmd("dbus-update-activation-environment --systemd WAYLAND_DISPLAY XDG_CURRENT_DESKTOP")
end)

-----------------------------
--- ENVIRONMENT VARIABLES ---
-----------------------------
hl.env("XCURSOR_SIZE", "24")
hl.env("ELECTRON_OZONE_PLATFORM_HINT", "auto")

------------------------------
--- LOOK, FEEL & INPUT     ---
------------------------------
hl.config({
    general = {
        gaps_in     = 4,
        gaps_out    = 8,
        border_size = 2,
        col = {
            active_border   = "rgba(1e66f5ff)",  -- Catppuccin Latte blue
            inactive_border = "rgba(ccd0daff)",  -- Catppuccin Latte surface0
        },
        layout = "dwindle",
    },

    decoration = {
        rounding = 6,
        shadow = { enabled = false },
        blur   = { enabled = false },
    },

    -- Parity with scripts/gnome: animations disabled.
    animations = {
        enabled = false,
    },

    -- Parity with scripts/gnome: compose key on right alt, no natural
    -- scrolling, touchpad fingers-click.
    input = {
        kb_options     = "compose:ralt",
        follow_mouse   = 1,
        natural_scroll = false,
        sensitivity    = 0,
        touchpad = {
            natural_scroll       = false,
            clickfinger_behavior = true,
        },
    },

    dwindle = {
        pseudotile     = true,
        preserve_split = true,
    },

    misc = {
        disable_hyprland_logo    = true,
        disable_splash_rendering = true,
    },
})

----------------
--- KEYBINDS ---
----------------
hl.bind(mainMod .. " + RETURN", hl.dsp.exec_cmd(terminal))
hl.bind(mainMod .. " + SPACE",  hl.dsp.exec_cmd(menu))
hl.bind(mainMod .. " + B",      hl.dsp.exec_cmd(browser))
hl.bind(mainMod .. " + Q",      hl.dsp.window.close())
hl.bind(mainMod .. " + V",      hl.dsp.window.float({ action = "toggle" }))
hl.bind(mainMod .. " + F",      hl.dsp.window.fullscreen())  -- verify name against wiki if it errors
hl.bind(mainMod .. " + J",      hl.dsp.layout("togglesplit"))
hl.bind(mainMod .. " + L",      hl.dsp.exec_cmd("loginctl lock-session"))
hl.bind(mainMod .. " + M",      hl.dsp.exit())

-- Move focus
hl.bind(mainMod .. " + left",  hl.dsp.focus({ direction = "left" }))
hl.bind(mainMod .. " + right", hl.dsp.focus({ direction = "right" }))
hl.bind(mainMod .. " + up",    hl.dsp.focus({ direction = "up" }))
hl.bind(mainMod .. " + down",  hl.dsp.focus({ direction = "down" }))

-- Workspaces (GNOME ran a single workspace; these are optional).
for i = 1, 5 do
    hl.bind(mainMod .. " + " .. i,         hl.dsp.focus({ workspace = i }))
    hl.bind(mainMod .. " + SHIFT + " .. i, hl.dsp.window.move({ workspace = i }))
end

-- Mouse window management
hl.bind(mainMod .. " + mouse:272", hl.dsp.window.drag(),   { mouse = true })
hl.bind(mainMod .. " + mouse:273", hl.dsp.window.resize(), { mouse = true })

-- Screenshots: region / full screen, copied to the clipboard
hl.bind("Print",         hl.dsp.exec_cmd("grim -g \"$(slurp)\" - | wl-copy"))
hl.bind("SHIFT + Print", hl.dsp.exec_cmd("grim - | wl-copy"))

-- Audio, brightness & media keys
hl.bind("XF86AudioRaiseVolume",  hl.dsp.exec_cmd("wpctl set-volume -l 1 @DEFAULT_AUDIO_SINK@ 5%+"), { locked = true, repeating = true })
hl.bind("XF86AudioLowerVolume",  hl.dsp.exec_cmd("wpctl set-volume @DEFAULT_AUDIO_SINK@ 5%-"),      { locked = true, repeating = true })
hl.bind("XF86AudioMute",         hl.dsp.exec_cmd("wpctl set-mute @DEFAULT_AUDIO_SINK@ toggle"),     { locked = true, repeating = true })
hl.bind("XF86MonBrightnessUp",   hl.dsp.exec_cmd("brightnessctl -e4 -n2 set 5%+"),                  { locked = true, repeating = true })
hl.bind("XF86MonBrightnessDown", hl.dsp.exec_cmd("brightnessctl -e4 -n2 set 5%-"),                  { locked = true, repeating = true })
hl.bind("XF86AudioPlay", hl.dsp.exec_cmd("playerctl play-pause"), { locked = true })
hl.bind("XF86AudioNext", hl.dsp.exec_cmd("playerctl next"),       { locked = true })
hl.bind("XF86AudioPrev", hl.dsp.exec_cmd("playerctl previous"),   { locked = true })
