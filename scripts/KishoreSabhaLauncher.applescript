set projectDir to "/Users/bhagvatdaraji/Documents/KishoreBot"
set startCommand to quoted form of (projectDir & "/scripts/start-kishorebot.command")

try
	do shell script startCommand
on error
	tell application "Terminal"
		activate
		do script startCommand
	end tell
end try
