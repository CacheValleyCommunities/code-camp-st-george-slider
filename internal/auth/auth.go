// Package auth stores dashboard users and sessions with GORM.
package auth

import (
	"crypto/rand"
	"crypto/sha256"
	"crypto/subtle"
	"encoding/base64"
	"encoding/hex"
	"errors"
	"net/http"
	"path/filepath"
	"regexp"
	"strings"
	"time"

	"github.com/glebarez/sqlite"
	"golang.org/x/crypto/bcrypt"
	"gorm.io/gorm"
	"gorm.io/gorm/logger"
)

const (
	RoleAdmin         = "admin"
	RoleStaff         = "staff"
	SessionCookie     = "cc_session"
	SessionTTL        = 24 * time.Hour
	seedAdminEmail    = "brent@codecamp.com"
	seedAdminPassword = "password"
)

var (
	ErrRegistrationClosed = errors.New("registration is closed")
	ErrInvalidCredentials = errors.New("invalid email or password")
	ErrEmailTaken         = errors.New("email already registered")
	ErrInvalidEmail       = errors.New("invalid email")
	ErrInvalidPassword    = errors.New("invalid password")
	ErrInvalidRole        = errors.New("invalid role")
	ErrDeleteSelf         = errors.New("cannot delete yourself")
	ErrLastAdmin          = errors.New("cannot delete the last admin")
	ErrNotFound           = errors.New("user not found")
)

var emailPattern = regexp.MustCompile(`^[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}$`)

type User struct {
	ID           uint   `gorm:"primaryKey"`
	Email        string `gorm:"uniqueIndex;size:254;not null"`
	PasswordHash string `gorm:"not null"`
	Role         string `gorm:"size:16;not null"`
	CreatedAt    time.Time
	UpdatedAt    time.Time
}

func (u User) IsAdmin() bool {
	return u.Role == RoleAdmin
}

type Session struct {
	ID        string    `gorm:"primaryKey;size:64"`
	UserID    uint      `gorm:"index;not null"`
	ExpiresAt time.Time `gorm:"index;not null"`
	CreatedAt time.Time
	User      User
}

type Identity struct {
	User        User
	SessionHash string
}

type Service struct {
	db        *gorm.DB
	cost      int
	dummyHash []byte
}

func Open(dbPath string, cost int) (*Service, error) {
	if err := ensureDir(filepath.Dir(dbPath)); err != nil {
		return nil, err
	}
	db, err := gorm.Open(sqlite.Open(dbPath), &gorm.Config{
		Logger: logger.Default.LogMode(logger.Silent),
	})
	if err != nil {
		return nil, err
	}
	sqlDB, err := db.DB()
	if err != nil {
		return nil, err
	}
	// One connection keeps the "first account wins" transaction honest on SQLite.
	sqlDB.SetMaxOpenConns(1)
	if err := db.Exec("PRAGMA foreign_keys = ON").Error; err != nil {
		return nil, err
	}
	if err := db.Exec("PRAGMA busy_timeout = 5000").Error; err != nil {
		return nil, err
	}
	if err := db.AutoMigrate(&User{}, &Session{}); err != nil {
		return nil, err
	}
	if cost == 0 {
		cost = 12
	}
	dummy, err := bcrypt.GenerateFromPassword([]byte("not-a-real-password"), cost)
	if err != nil {
		return nil, err
	}
	svc := &Service{db: db, cost: cost, dummyHash: dummy}
	svc.PurgeExpired()
	return svc, nil
}

func ensureDir(dir string) error {
	if dir == "" || dir == "." {
		return nil
	}
	return osMkdirAll(dir)
}

// DB is the shared GORM connection. Other tables use it so SQLite stays on one connection.
func (s *Service) DB() *gorm.DB {
	return s.db
}

// EnsureSeedAdmin inserts the dashboard admin when that email is missing.
// An existing row is left unchanged, including its password.
// The seed password is shorter than the public create-user minimum, so this
// hashes it directly instead of calling normalizeCredentials.
func (s *Service) EnsureSeedAdmin() (User, error) {
	var existing User
	err := s.db.Where("email = ?", seedAdminEmail).First(&existing).Error
	if err == nil {
		return existing, nil
	}
	if !errors.Is(err, gorm.ErrRecordNotFound) {
		return User{}, err
	}
	hash, err := bcrypt.GenerateFromPassword([]byte(seedAdminPassword), s.cost)
	if err != nil {
		return User{}, err
	}
	user := User{Email: seedAdminEmail, PasswordHash: string(hash), Role: RoleAdmin}
	if err := s.db.Create(&user).Error; err != nil {
		if strings.Contains(strings.ToLower(err.Error()), "unique") {
			var again User
			if findErr := s.db.Where("email = ?", seedAdminEmail).First(&again).Error; findErr != nil {
				return User{}, findErr
			}
			return again, nil
		}
		return User{}, err
	}
	return user, nil
}

func (s *Service) HasUsers() (bool, error) {
	var n int64
	if err := s.db.Model(&User{}).Count(&n).Error; err != nil {
		return false, err
	}
	return n > 0, nil
}

func (s *Service) CreateFirstAdmin(email, password string) (User, error) {
	email, password, err := normalizeCredentials(email, password)
	if err != nil {
		return User{}, err
	}
	hash, err := bcrypt.GenerateFromPassword([]byte(password), s.cost)
	if err != nil {
		return User{}, err
	}
	user := User{Email: email, PasswordHash: string(hash), Role: RoleAdmin}
	err = s.db.Transaction(func(tx *gorm.DB) error {
		var n int64
		if err := tx.Model(&User{}).Count(&n).Error; err != nil {
			return err
		}
		if n > 0 {
			return ErrRegistrationClosed
		}
		return tx.Create(&user).Error
	})
	if err != nil {
		return User{}, err
	}
	return user, nil
}

func (s *Service) CreateUser(email, password, role string) (User, error) {
	email, password, err := normalizeCredentials(email, password)
	if err != nil {
		return User{}, err
	}
	switch role {
	case RoleAdmin, RoleStaff:
	default:
		return User{}, ErrInvalidRole
	}
	hash, err := bcrypt.GenerateFromPassword([]byte(password), s.cost)
	if err != nil {
		return User{}, err
	}
	user := User{Email: email, PasswordHash: string(hash), Role: role}
	if err := s.db.Create(&user).Error; err != nil {
		if strings.Contains(strings.ToLower(err.Error()), "unique") {
			return User{}, ErrEmailTaken
		}
		return User{}, err
	}
	return user, nil
}

func (s *Service) ListUsers() ([]User, error) {
	var users []User
	err := s.db.Order("created_at asc").Find(&users).Error
	return users, err
}

func (s *Service) DeleteUser(actorID, targetID uint) error {
	if actorID == targetID {
		return ErrDeleteSelf
	}
	return s.db.Transaction(func(tx *gorm.DB) error {
		var target User
		if err := tx.First(&target, targetID).Error; err != nil {
			if errors.Is(err, gorm.ErrRecordNotFound) {
				return ErrNotFound
			}
			return err
		}
		if target.Role == RoleAdmin {
			var admins int64
			if err := tx.Model(&User{}).Where("role = ?", RoleAdmin).Count(&admins).Error; err != nil {
				return err
			}
			if admins <= 1 {
				return ErrLastAdmin
			}
		}
		if err := tx.Where("user_id = ?", targetID).Delete(&Session{}).Error; err != nil {
			return err
		}
		return tx.Delete(&User{}, targetID).Error
	})
}

func (s *Service) Login(email, password string) (User, error) {
	email = normalizeEmail(email)
	var user User
	err := s.db.Where("email = ?", email).First(&user).Error
	hash := s.dummyHash
	if err == nil {
		hash = []byte(user.PasswordHash)
	} else if !errors.Is(err, gorm.ErrRecordNotFound) {
		return User{}, err
	}
	if bcrypt.CompareHashAndPassword(hash, []byte(password)) != nil || err != nil {
		return User{}, ErrInvalidCredentials
	}
	return user, nil
}

func (s *Service) StartSession(userID uint) (string, error) {
	raw, hash, err := newToken()
	if err != nil {
		return "", err
	}
	sess := Session{
		ID:        hash,
		UserID:    userID,
		ExpiresAt: time.Now().Add(SessionTTL),
	}
	if err := s.db.Create(&sess).Error; err != nil {
		return "", err
	}
	return raw, nil
}

func (s *Service) FromRequest(r *http.Request) (Identity, bool) {
	cookie, err := r.Cookie(SessionCookie)
	if err != nil || cookie.Value == "" {
		return Identity{}, false
	}
	hash := hashToken(cookie.Value)
	var sess Session
	err = s.db.Preload("User").Where("id = ? AND expires_at > ?", hash, time.Now()).First(&sess).Error
	if err != nil || sess.User.ID == 0 {
		return Identity{}, false
	}
	return Identity{User: sess.User, SessionHash: hash}, true
}

func (s *Service) SessionLive(hash string) bool {
	if hash == "" {
		return false
	}
	var n int64
	err := s.db.Model(&Session{}).Where("id = ? AND expires_at > ?", hash, time.Now()).Count(&n).Error
	return err == nil && n == 1
}

func (s *Service) EndSession(rawToken string) {
	if rawToken == "" {
		return
	}
	s.db.Where("id = ?", hashToken(rawToken)).Delete(&Session{})
}

func (s *Service) PurgeExpired() {
	s.db.Where("expires_at < ?", time.Now()).Delete(&Session{})
}

func normalizeCredentials(email, password string) (string, string, error) {
	email = normalizeEmail(email)
	if !emailPattern.MatchString(email) || len(email) > 254 {
		return "", "", ErrInvalidEmail
	}
	if len(password) < 10 || len(password) > 72 {
		return "", "", ErrInvalidPassword
	}
	return email, password, nil
}

func normalizeEmail(email string) string {
	return strings.ToLower(strings.TrimSpace(email))
}

func newToken() (raw string, hash string, err error) {
	buf := make([]byte, 32)
	if _, err = rand.Read(buf); err != nil {
		return "", "", err
	}
	raw = base64.RawURLEncoding.EncodeToString(buf)
	return raw, hashToken(raw), nil
}

func hashToken(raw string) string {
	sum := sha256.Sum256([]byte(raw))
	return hex.EncodeToString(sum[:])
}

// TokensEqual compares two strings without leaking length differences past the caller.
func TokensEqual(a, b string) bool {
	if len(a) != len(b) {
		return false
	}
	return subtle.ConstantTimeCompare([]byte(a), []byte(b)) == 1
}
