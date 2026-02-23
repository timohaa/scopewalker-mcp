package sample

// Add adds two integers.
func Add(a, b int) int {
	return a + b
}

func subtract(a, b int) int {
	return a - b
}

// Calculator provides basic arithmetic operations.
type Calculator struct {
	value int
}

// NewCalculator creates a new Calculator.
func NewCalculator() *Calculator {
	return &Calculator{value: 0}
}

func (c *Calculator) Add(n int) {
	c.value += n
}
