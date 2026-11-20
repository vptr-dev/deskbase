# Draws the installer artwork into build/ (electron-builder picks these up by name):
#   installerSidebar.bmp / uninstallerSidebar.bmp  164x314  (welcome and finish pages)
#   installerHeader.bmp                            150x57   (top of the other pages)
# Run: powershell -NoProfile -File scripts/installer-art.ps1
Add-Type -AssemblyName System.Drawing
$root = Split-Path -Parent $PSScriptRoot
$build = Join-Path $root 'build'
$icon = [System.Drawing.Image]::FromFile((Join-Path $build 'icon.png'))

function New-Canvas([int]$w, [int]$h) {
  $bmp = New-Object System.Drawing.Bitmap $w, $h, ([System.Drawing.Imaging.PixelFormat]::Format24bppRgb)
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.SmoothingMode = 'AntiAlias'
  $g.InterpolationMode = 'HighQualityBicubic'
  $g.TextRenderingHint = 'AntiAliasGridFit'
  return @($bmp, $g)
}

function Save-Bmp($bmp, [string]$name) {
  $bmp.Save((Join-Path $build $name), [System.Drawing.Imaging.ImageFormat]::Bmp)
}

# ---- sidebar: deep blue glass, soft light, the icon and the name ----
foreach ($name in 'installerSidebar.bmp', 'uninstallerSidebar.bmp') {
  $bmp, $g = New-Canvas 164 314
  $rect = New-Object System.Drawing.Rectangle 0, 0, 164, 314
  $bg = New-Object System.Drawing.Drawing2D.LinearGradientBrush $rect, ([System.Drawing.Color]::FromArgb(255, 22, 30, 58)), ([System.Drawing.Color]::FromArgb(255, 10, 12, 24)), 90.0
  $g.FillRectangle($bg, $rect)

  # two soft lights behind the icon
  foreach ($glow in @(@(-40, 20, 200, 0x0a84ff, 70), @(40, 150, 180, 0x5e5ce6, 45))) {
    $path = New-Object System.Drawing.Drawing2D.GraphicsPath
    $path.AddEllipse($glow[0], $glow[1], $glow[2], $glow[2])
    $pg = New-Object System.Drawing.Drawing2D.PathGradientBrush $path
    $c = [System.Drawing.Color]::FromArgb($glow[4], ($glow[3] -shr 16) -band 255, ($glow[3] -shr 8) -band 255, $glow[3] -band 255)
    $pg.CenterColor = $c
    $pg.SurroundColors = @([System.Drawing.Color]::FromArgb(0, $c.R, $c.G, $c.B))
    $g.FillPath($pg, $path)
  }

  # a faint glass card with the icon
  $card = New-Object System.Drawing.Drawing2D.GraphicsPath
  $r = 18; $x = 38; $y = 74; $s = 88
  $card.AddArc($x, $y, $r, $r, 180, 90); $card.AddArc($x + $s - $r, $y, $r, $r, 270, 90)
  $card.AddArc($x + $s - $r, $y + $s - $r, $r, $r, 0, 90); $card.AddArc($x, $y + $s - $r, $r, $r, 90, 90)
  $card.CloseFigure()
  $g.FillPath((New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(22, 255, 255, 255))), $card)
  $g.DrawPath((New-Object System.Drawing.Pen ([System.Drawing.Color]::FromArgb(60, 255, 255, 255)), 1), $card)
  $g.DrawImage($icon, 52, 88, 60, 60)

  $fmt = New-Object System.Drawing.StringFormat
  $fmt.Alignment = 'Center'
  $title = New-Object System.Drawing.Font 'Segoe UI Semibold', 15, ([System.Drawing.FontStyle]::Regular), ([System.Drawing.GraphicsUnit]::Pixel)
  $sub = New-Object System.Drawing.Font 'Segoe UI', 10, ([System.Drawing.FontStyle]::Regular), ([System.Drawing.GraphicsUnit]::Pixel)
  $g.DrawString('Deskbase', $title, [System.Drawing.Brushes]::White, (New-Object System.Drawing.RectangleF 0, 182, 164, 24), $fmt)
  $g.DrawString('Pages, tasks and notes', $sub, (New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(170, 220, 228, 255))), (New-Object System.Drawing.RectangleF 0, 206, 164, 16), $fmt)
  $g.DrawString('on your desktop', $sub, (New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(170, 220, 228, 255))), (New-Object System.Drawing.RectangleF 0, 220, 164, 16), $fmt)

  # thin light line at the bottom
  $g.FillRectangle((New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(40, 255, 255, 255))), 52, 292, 60, 1)
  $g.Dispose(); Save-Bmp $bmp $name; $bmp.Dispose()
}

# ---- header: white with the icon on the right ----
$bmp, $g = New-Canvas 150 57
$g.Clear([System.Drawing.Color]::White)
$g.DrawImage($icon, 104, 10, 37, 37)
$g.Dispose(); Save-Bmp $bmp 'installerHeader.bmp'; $bmp.Dispose()

$icon.Dispose()
'Installer artwork written to build/'
