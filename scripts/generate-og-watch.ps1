# Generates public/og-watch.png — the share-preview asset for /watch routes.
#
# Mirrors the original og-image.png generator (which was a one-shot bash
# invocation back in v1.3.1, not committed at the time per CLAUDE.md).
# This script IS committed for reproducibility — the OG asset is part
# of the brand surface and needs to regenerate cleanly when the wordmark
# or tagline shifts.
#
# Dimensions:
#   1200 x 630 (Open Graph + Twitter Card large-image standard)
#
# Palette (CSS vars in src/index.css):
#   --bg-void       #07080d
#   --bg-deep       #0b0d14
#   --bg-panel      #12151f
#   --cosmic-violet #5B3A8F
#   --cosmic-glow   #6E4FB8
#   --accent        #E94560
#   --ink           #ECE6D6
#   --ink-soft      #C9C2B0
#   --ink-muted     #8A8474
#
# Fonts (with system fallbacks since the cosmic Google fonts may not
# be installed system-wide on the build machine):
#   Display:  Bebas Neue → Impact → Arial Black
#   Body:     Inter      → Segoe UI → Arial
#   Mono:     JetBrains Mono → Consolas
#
# Output path:
#   public/og-watch.png  (relative to this script's parent dir = repo root)
#
# Run from any shell that can invoke PowerShell:
#   powershell -ExecutionPolicy Bypass -File scripts/generate-og-watch.ps1
#
# After generating, commit the resulting public/og-watch.png alongside
# this script.

Add-Type -AssemblyName System.Drawing

# ---- Constants ----

$WIDTH = 1200
$HEIGHT = 630
$OutputPath = Join-Path (Split-Path -Parent $PSScriptRoot) 'public\og-watch.png'

# ---- Palette ----

$bgVoid       = [System.Drawing.Color]::FromArgb(255,   7,   8,  13)  # #07080d
$bgDeep       = [System.Drawing.Color]::FromArgb(255,  11,  13,  20)  # #0b0d14
$cosmicViolet = [System.Drawing.Color]::FromArgb(255,  91,  58, 143)  # #5B3A8F
$cosmicGlow   = [System.Drawing.Color]::FromArgb(255, 110,  79, 184)  # #6E4FB8
$cosmicMid    = [System.Drawing.Color]::FromArgb(255,  42,  36,  86)  # #2A2456
$accent       = [System.Drawing.Color]::FromArgb(255, 233,  69,  96)  # #E94560
$ink          = [System.Drawing.Color]::FromArgb(255, 236, 230, 214)  # #ECE6D6
$inkSoft      = [System.Drawing.Color]::FromArgb(255, 201, 194, 176)  # #C9C2B0
$inkMuted     = [System.Drawing.Color]::FromArgb(255, 138, 132, 116)  # #8A8474

# Helper: alpha-blend variants for translucent strokes
function New-AlphaColor([System.Drawing.Color]$c, [int]$alpha) {
  return [System.Drawing.Color]::FromArgb($alpha, $c.R, $c.G, $c.B)
}

# ---- Font resolution with graceful fallback ----

function Resolve-Font([string[]]$names, [single]$size, [System.Drawing.FontStyle]$style) {
  foreach ($n in $names) {
    try {
      $f = New-Object System.Drawing.Font($n, $size, $style, [System.Drawing.GraphicsUnit]::Point)
      # Verify the family resolved to something we asked for; FromName
      # silently picks a default substitute when the requested family is
      # absent. Compare the resolved family back to our wishlist.
      foreach ($wanted in $names) {
        if ($f.FontFamily.Name -ieq $wanted) { return $f }
      }
      $f.Dispose()
    } catch {
      # try next
    }
  }
  # Last resort
  return New-Object System.Drawing.Font('Arial', $size, $style, [System.Drawing.GraphicsUnit]::Point)
}

$displayFont  = Resolve-Font @('Bebas Neue', 'Impact', 'Arial Black') 92  ([System.Drawing.FontStyle]::Regular)
$displaySmall = Resolve-Font @('Bebas Neue', 'Impact', 'Arial Black') 38  ([System.Drawing.FontStyle]::Regular)
$bodyFont     = Resolve-Font @('Inter', 'Segoe UI', 'Arial')          24  ([System.Drawing.FontStyle]::Regular)
$monoFont     = Resolve-Font @('JetBrains Mono', 'Consolas', 'Courier New') 16 ([System.Drawing.FontStyle]::Regular)

Write-Host "Resolved fonts:"
Write-Host "  display: $($displayFont.FontFamily.Name) @ $($displayFont.Size)pt"
Write-Host "  small:   $($displaySmall.FontFamily.Name) @ $($displaySmall.Size)pt"
Write-Host "  body:    $($bodyFont.FontFamily.Name) @ $($bodyFont.Size)pt"
Write-Host "  mono:    $($monoFont.FontFamily.Name) @ $($monoFont.Size)pt"

# ---- Canvas setup ----

$bmp = New-Object System.Drawing.Bitmap $WIDTH, $HEIGHT
$g = [System.Drawing.Graphics]::FromImage($bmp)
$g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
$g.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::AntiAliasGridFit
$g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
$g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality

# ---- Background: diagonal cosmic gradient (#07080d → #2A2456) ----

$gradRect = New-Object System.Drawing.Rectangle 0, 0, $WIDTH, $HEIGHT
$gradBrush = New-Object System.Drawing.Drawing2D.LinearGradientBrush(
  $gradRect,
  $bgVoid,
  $cosmicMid,
  155.0
)
$g.FillRectangle($gradBrush, $gradRect)

# Subtle starfield — tiny dots scattered across the canvas. RNG seeded so
# the same image regenerates with the same star pattern.
$rng = New-Object System.Random 0xDEADBEEF
for ($i = 0; $i -lt 60; $i++) {
  $sx = $rng.Next(0, $WIDTH)
  $sy = $rng.Next(0, $HEIGHT)
  $alpha = $rng.Next(20, 90)
  $size = if ($rng.NextDouble() -lt 0.85) { 1 } else { 2 }
  $starBrush = New-Object System.Drawing.SolidBrush (New-AlphaColor $ink $alpha)
  $g.FillEllipse($starBrush, $sx, $sy, $size, $size)
  $starBrush.Dispose()
}

# ---- Aperture Sigil — left side ----
#
# Reproduced from src/components/ApertureSigil.tsx, simplified for OG
# scale. SVG viewBox is 200x200; we scale to 280x280 centered at (220, 315).

$cx = 220.0
$cy = 315.0
$scale = 280.0 / 200.0  # 1.4x

function S([single]$v) { return $v * $scale }
function Px([single]$svgX) { return $cx + S($svgX - 100.0) }
function Py([single]$svgY) { return $cy + S($svgY - 100.0) }

# Outer hex stroke
$violetPen = New-Object System.Drawing.Pen ((New-AlphaColor $cosmicGlow 220), 2.4)
$hexPoints = @(
  (New-Object System.Drawing.PointF (Px 100), (Py 8)),
  (New-Object System.Drawing.PointF (Px 173), (Py 50)),
  (New-Object System.Drawing.PointF (Px 173), (Py 150)),
  (New-Object System.Drawing.PointF (Px 100), (Py 192)),
  (New-Object System.Drawing.PointF (Px 27),  (Py 150)),
  (New-Object System.Drawing.PointF (Px 27),  (Py 50))
)
$g.DrawPolygon($violetPen, $hexPoints)

# Inner hex stroke (lighter)
$violetPenLight = New-Object System.Drawing.Pen ((New-AlphaColor $cosmicGlow 140), 1.2)
$innerHex = @(
  (New-Object System.Drawing.PointF (Px 100), (Py 20)),
  (New-Object System.Drawing.PointF (Px 162), (Py 56)),
  (New-Object System.Drawing.PointF (Px 162), (Py 144)),
  (New-Object System.Drawing.PointF (Px 100), (Py 180)),
  (New-Object System.Drawing.PointF (Px 38),  (Py 144)),
  (New-Object System.Drawing.PointF (Px 38),  (Py 56))
)
$g.DrawPolygon($violetPenLight, $innerHex)

# Hex corner red dots
$accentBrush = New-Object System.Drawing.SolidBrush $accent
foreach ($pt in $hexPoints) {
  $g.FillEllipse($accentBrush, $pt.X - 4, $pt.Y - 4, 8, 8)
}

# Iris — radial gradient, violet center → cosmic-mid → bg-void
$irisCx = Px 100
$irisCy = Py 100
$irisR = S 58
$irisRect = New-Object System.Drawing.RectangleF ($irisCx - $irisR), ($irisCy - $irisR), ($irisR * 2), ($irisR * 2)
$irisPath = New-Object System.Drawing.Drawing2D.GraphicsPath
$irisPath.AddEllipse($irisRect)
$irisBrush = New-Object System.Drawing.Drawing2D.PathGradientBrush $irisPath
$irisBrush.CenterColor = $cosmicGlow
$irisBrush.SurroundColors = @($bgVoid)
$irisBrush.CenterPoint = New-Object System.Drawing.PointF ($irisCx), ($irisCy - $irisR * 0.1)
$g.FillEllipse($irisBrush, $irisRect)
$g.DrawEllipse($violetPen, $irisRect)

# Inner concentric circles (just one for OG simplicity vs the SVG's two)
$ringRect = New-Object System.Drawing.RectangleF ($irisCx - (S 32)), ($irisCy - (S 32)), (S 64), (S 64)
$g.DrawEllipse($violetPenLight, $ringRect)

# Pupil — tiny red dot at center, glow behind
$glowR = S 9
$glowRect = New-Object System.Drawing.RectangleF ($irisCx - $glowR), ($irisCy - $glowR), ($glowR * 2), ($glowR * 2)
$glowBrush = New-Object System.Drawing.SolidBrush (New-AlphaColor $accent 80)
$g.FillEllipse($glowBrush, $glowRect)
$pupilR = S 5
$pupilRect = New-Object System.Drawing.RectangleF ($irisCx - $pupilR), ($irisCy - $pupilR), ($pupilR * 2), ($pupilR * 2)
$g.FillEllipse($accentBrush, $pupilRect)

# Red diagonal gash across the iris
$gashPen = New-Object System.Drawing.Pen $accent, 3.2
$gashPen.StartCap = [System.Drawing.Drawing2D.LineCap]::Round
$gashPen.EndCap = [System.Drawing.Drawing2D.LineCap]::Round
$g.DrawLine($gashPen, [single](Px 38), [single](Py 70), [single](Px 162), [single](Py 130))

# ---- Right column — wordmark + tagline ----

$rightX = 480

# Eyebrow: tiny mono caption above the wordmark
$eyebrowText = "DOTA WEAKNESS REPORT"
$eyebrowBrush = New-Object System.Drawing.SolidBrush $inkMuted
$g.DrawString($eyebrowText, $monoFont, $eyebrowBrush, $rightX, 200)

# Wordmark: "WATCH LIKE A COACH" in display font
$wordmarkText = "WATCH LIKE A COACH"
$wordmarkBrush = New-Object System.Drawing.SolidBrush $ink
$g.DrawString($wordmarkText, $displayFont, $wordmarkBrush, $rightX, 235)

# Red accent: small horizontal line under the wordmark to anchor it
$accentLinePen = New-Object System.Drawing.Pen $accent, 3
$g.DrawLine($accentLinePen, $rightX, 360, ($rightX + 80), 360)

# Tagline: "What stood out — every recent pro match."
$taglineText = "What stood out — every recent pro match."
$taglineBrush = New-Object System.Drawing.SolidBrush $inkSoft
$g.DrawString($taglineText, $bodyFont, $taglineBrush, $rightX, 380)

# Domain caption at bottom-right
$domainText = "DOTAWEAKNESS.COM"
$domainBrush = New-Object System.Drawing.SolidBrush $inkMuted
$domainSize = $g.MeasureString($domainText, $monoFont)
$g.DrawString($domainText, $monoFont, $domainBrush, $WIDTH - $domainSize.Width - 36, $HEIGHT - $domainSize.Height - 28)

# ---- Save ----

$outputDir = Split-Path -Parent $OutputPath
if (-not (Test-Path $outputDir)) {
  New-Item -ItemType Directory -Path $outputDir -Force | Out-Null
}
$bmp.Save($OutputPath, [System.Drawing.Imaging.ImageFormat]::Png)

Write-Host ""
Write-Host "Wrote $OutputPath"
$fileInfo = Get-Item $OutputPath
Write-Host "Size: $([math]::Round($fileInfo.Length / 1024, 1)) KB"
Write-Host "Dimensions: ${WIDTH}x${HEIGHT}"

# ---- Cleanup ----

$gashPen.Dispose()
$accentLinePen.Dispose()
$violetPen.Dispose()
$violetPenLight.Dispose()
$accentBrush.Dispose()
$glowBrush.Dispose()
$irisBrush.Dispose()
$irisPath.Dispose()
$gradBrush.Dispose()
$wordmarkBrush.Dispose()
$taglineBrush.Dispose()
$eyebrowBrush.Dispose()
$domainBrush.Dispose()
$displayFont.Dispose()
$displaySmall.Dispose()
$bodyFont.Dispose()
$monoFont.Dispose()
$g.Dispose()
$bmp.Dispose()
