package httpapi

import (
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"strings"
)

func decodeJSON(r *http.Request, dst any) error {
	decoder := json.NewDecoder(r.Body)
	decoder.DisallowUnknownFields()

	if err := decoder.Decode(dst); err != nil {
		var syntaxError *json.SyntaxError
		switch {
		case errors.As(err, &syntaxError):
			return fmt.Errorf("invalid JSON at position %d", syntaxError.Offset)
		case errors.Is(err, io.EOF):
			return errors.New("request body is required")
		case strings.Contains(err.Error(), "http: request body too large"):
			return errors.New("request body too large")
		default:
			return errors.New("invalid request body")
		}
	}

	if err := decoder.Decode(&struct{}{}); err != io.EOF {
		return errors.New("request body must contain a single JSON object")
	}

	return nil
}
