package httpapi

import (
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log"
	"net/http"
	"strings"

	"github.com/go-chi/chi/v5/middleware"
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

func writeInternalError(w http.ResponseWriter, r *http.Request, operation, publicMessage string, err error) {
	log.Printf(
		"request_id=%s operation=%s error=%q",
		middleware.GetReqID(r.Context()),
		operation,
		err,
	)
	http.Error(w, publicMessage, http.StatusInternalServerError)
}
