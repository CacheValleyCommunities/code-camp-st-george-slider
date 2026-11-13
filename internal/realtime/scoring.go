package realtime

import "math"

// PointsForElapsed matches the previous scoring rule: 50 points, minus a
// penalty that grows by 1.5x every 10 seconds.
func PointsForElapsed(elapsedSeconds int) int {
	if elapsedSeconds < 0 {
		elapsedSeconds = 0
	}
	const base = 50
	penalty := 0.0
	multiplier := 1.0
	for second := 1; second <= elapsedSeconds; second++ {
		if second%10 == 0 {
			multiplier *= 1.5
		}
		penalty += multiplier
	}
	points := math.Floor(float64(base) - penalty)
	if points < 0 {
		return 0
	}
	return int(points)
}
