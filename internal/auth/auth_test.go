package auth

import (
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"testing"
	"time"

	"golang.org/x/crypto/bcrypt"
)

func TestFirstAccountIsAdminAndRegistrationCloses(t *testing.T) {
	svc := openTest(t)
	user, err := svc.CreateFirstAdmin("Admin@Example.com", "password123")
	if err != nil {
		t.Fatal(err)
	}
	if user.Role != RoleAdmin || user.Email != "admin@example.com" {
		t.Fatalf("user = %+v", user)
	}
	if _, err := svc.CreateFirstAdmin("other@example.com", "password123"); err != ErrRegistrationClosed {
		t.Fatalf("err = %v", err)
	}
	staff, err := svc.CreateUser("staff@example.com", "password123", RoleStaff)
	if err != nil {
		t.Fatal(err)
	}
	if staff.Role != RoleStaff {
		t.Fatalf("role = %s", staff.Role)
	}
	if _, err := svc.CreateUser("staff@example.com", "password123", RoleStaff); err != ErrEmailTaken {
		t.Fatalf("err = %v", err)
	}
}

func TestEnsureSeedAdmin(t *testing.T) {
	svc := openTest(t)
	user, err := svc.EnsureSeedAdmin()
	if err != nil {
		t.Fatal(err)
	}
	if user.Role != RoleAdmin || user.Email != seedAdminEmail {
		t.Fatalf("user = %+v", user)
	}
	signedIn, err := svc.Login(seedAdminEmail, seedAdminPassword)
	if err != nil {
		t.Fatal(err)
	}
	if signedIn.ID != user.ID {
		t.Fatalf("login id = %d, seed id = %d", signedIn.ID, user.ID)
	}
	again, err := svc.EnsureSeedAdmin()
	if err != nil {
		t.Fatal(err)
	}
	if again.ID != user.ID {
		t.Fatalf("second seed id = %d, first id = %d", again.ID, user.ID)
	}
	var n int64
	if err := svc.db.Model(&User{}).Where("email = ?", seedAdminEmail).Count(&n).Error; err != nil {
		t.Fatal(err)
	}
	if n != 1 {
		t.Fatalf("seed rows = %d", n)
	}
	if _, err := svc.CreateFirstAdmin("other@example.com", "password123"); err != ErrRegistrationClosed {
		t.Fatalf("err = %v", err)
	}
}

func TestLoginAndSessionExpiry(t *testing.T) {
	svc := openTest(t)
	user, err := svc.CreateFirstAdmin("admin@example.com", "password123")
	if err != nil {
		t.Fatal(err)
	}
	if _, err := svc.Login("admin@example.com", "wrong-password"); err != ErrInvalidCredentials {
		t.Fatalf("err = %v", err)
	}
	if _, err := svc.Login("missing@example.com", "password123"); err != ErrInvalidCredentials {
		t.Fatalf("err = %v", err)
	}
	raw, err := svc.StartSession(user.ID)
	if err != nil {
		t.Fatal(err)
	}
	req := httptest.NewRequest(http.MethodGet, "/", nil)
	req.AddCookie(&http.Cookie{Name: SessionCookie, Value: raw})
	identity, ok := svc.FromRequest(req)
	if !ok || identity.User.Email != user.Email {
		t.Fatalf("identity = %+v ok=%v", identity, ok)
	}
	if !svc.SessionLive(identity.SessionHash) {
		t.Fatal("expected live session")
	}
	if err := svc.db.Model(&Session{}).Where("id = ?", identity.SessionHash).Update("expires_at", time.Now().Add(-time.Minute)).Error; err != nil {
		t.Fatal(err)
	}
	if _, ok := svc.FromRequest(req); ok {
		t.Fatal("expired session was accepted")
	}
	if err := svc.DeleteUser(user.ID, user.ID); err != ErrDeleteSelf {
		t.Fatalf("err = %v", err)
	}
}

func openTest(t *testing.T) *Service {
	t.Helper()
	svc, err := Open(filepath.Join(t.TempDir(), "auth.db"), bcrypt.MinCost)
	if err != nil {
		t.Fatal(err)
	}
	return svc
}
