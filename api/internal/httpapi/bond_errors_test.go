package httpapi

import (
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/dalitsokasonde/expense-tracker/api/internal/store"
)

func bondErrorResponse(err error) *httptest.ResponseRecorder {
	recorder := httptest.NewRecorder()
	writeBondError(recorder, httptest.NewRequest(http.MethodPost, "/v1/bonds", nil), "bonds.test", err)
	return recorder
}

func TestABondSymbolCollisionSaysWhatToDoInstead(t *testing.T) {
	response := bondErrorResponse(store.ErrConflict)
	if response.Code != http.StatusConflict {
		t.Fatalf("status = %d, want 409", response.Code)
	}
	if !strings.Contains(response.Body.String(), "Existing government bond") {
		t.Fatalf("body %q does not point to adding to the existing bond", response.Body.String())
	}
}

func TestAnUnexpectedBondFailureDoesNotShowTheRawError(t *testing.T) {
	response := bondErrorResponse(errors.New(`pq: relation "bond_positions" violates something internal`))
	if response.Code != http.StatusInternalServerError {
		t.Fatalf("status = %d, want 500", response.Code)
	}
	if strings.Contains(response.Body.String(), "bond_positions") {
		t.Fatalf("internal error text reached the client: %q", response.Body.String())
	}
}

func TestAMissingFundingAccountIsANotFoundTheScreenCanExplain(t *testing.T) {
	response := bondErrorResponse(store.ErrNotFound)
	if response.Code != http.StatusNotFound || !strings.Contains(response.Body.String(), "archived") {
		t.Fatalf("got %d %q", response.Code, response.Body.String())
	}
}
