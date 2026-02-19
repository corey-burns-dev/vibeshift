// Package main provides a CLI to check OpenAPI compatibility with the frontend.
package main

import (
	"errors"
	"flag"
	"fmt"
	"os"
	"sort"
	"strings"

	"gopkg.in/yaml.v3"
)

var supportedMethods = map[string]struct{}{
	"get":     {},
	"put":     {},
	"post":    {},
	"delete":  {},
	"patch":   {},
	"head":    {},
	"options": {},
}

type operation struct {
	Responses map[string]struct{}
}

type parsedSpec struct {
	Paths map[string]map[string]operation
}

func main() {
	basePath := flag.String("base", "", "base OpenAPI swagger.yaml path")
	revisionPath := flag.String("revision", "", "revision OpenAPI swagger.yaml path")
	flag.Parse()

	if strings.TrimSpace(*basePath) == "" || strings.TrimSpace(*revisionPath) == "" {
		fmt.Fprintln(os.Stderr, "usage: openapi-compat -base <path> -revision <path>")
		os.Exit(2)
	}

	baseSpec, err := loadSpec(*basePath)
	if err != nil {
		fmt.Fprintf(os.Stderr, "failed to load base spec: %v\n", err)
		os.Exit(1)
	}
	revisionSpec, err := loadSpec(*revisionPath)
	if err != nil {
		fmt.Fprintf(os.Stderr, "failed to load revision spec: %v\n", err)
		os.Exit(1)
	}

	issues := compare(baseSpec, revisionSpec)
	if len(issues) > 0 {
		fmt.Fprintln(os.Stderr, "backward compatibility check failed:")
		for _, issue := range issues {
			fmt.Fprintf(os.Stderr, "- %s\n", issue)
		}
		os.Exit(1)
	}

	fmt.Println("openapi compatibility check passed")
}

func loadSpec(path string) (parsedSpec, error) {
	// #nosec G304: path comes from CLI flags in a dev tool
	raw, err := os.ReadFile(path)
	if err != nil {
		return parsedSpec{}, err
	}

	doc := map[string]interface{}{}
	if err := yaml.Unmarshal(raw, &doc); err != nil {
		return parsedSpec{}, err
	}

	pathsRaw, ok := doc["paths"]
	if !ok {
		return parsedSpec{}, errors.New("missing top-level paths field")
	}

	pathsMap, ok := toMap(pathsRaw)
	if !ok {
		return parsedSpec{}, errors.New("paths is not an object")
	}

	spec := parsedSpec{Paths: make(map[string]map[string]operation)}

	for pathKey, pathEntry := range pathsMap {
		pathOpsRaw, ok := toMap(pathEntry)
		if !ok {
			continue
		}

		ops := make(map[string]operation)
		for methodKey, methodEntry := range pathOpsRaw {
			methodLower := strings.ToLower(strings.TrimSpace(methodKey))
			if _, supported := supportedMethods[methodLower]; !supported {
				continue
			}

			methodMap, ok := toMap(methodEntry)
			if !ok {
				continue
			}

			responseSet := make(map[string]struct{})
			if responsesRaw, exists := methodMap["responses"]; exists {
				if responsesMap, ok := toMap(responsesRaw); ok {
					for code := range responsesMap {
						normalized := strings.ToLower(strings.TrimSpace(code))
						if normalized != "" {
							responseSet[normalized] = struct{}{}
						}
					}
				}
			}

			ops[methodLower] = operation{Responses: responseSet}
		}

		if len(ops) > 0 {
			spec.Paths[pathKey] = ops
		}
	}

	return spec, nil
}

func toMap(v interface{}) (map[string]interface{}, bool) {
	switch t := v.(type) {
	case map[string]interface{}:
		return t, true
	case map[interface{}]interface{}:
		out := make(map[string]interface{}, len(t))
		for k, val := range t {
			ks, ok := k.(string)
			if !ok {
				continue
			}
			out[ks] = val
		}
		return out, true
	default:
		return nil, false
	}
}

func compare(base, revision parsedSpec) []string {
	var issues []string

	for path, baseOps := range base.Paths {
		revOps, ok := revision.Paths[path]
		if !ok {
			issues = append(issues, fmt.Sprintf("removed path: %s", path))
			continue
		}

		for method, baseOp := range baseOps {
			revOp, ok := revOps[method]
			if !ok {
				issues = append(issues, fmt.Sprintf("removed operation: %s %s", strings.ToUpper(method), path))
				continue
			}

			for responseCode := range baseOp.Responses {
				if _, ok := revOp.Responses[responseCode]; !ok {
					issues = append(issues, fmt.Sprintf(
						"removed response code: %s %s -> %s",
						strings.ToUpper(method), path, strings.ToUpper(responseCode),
					))
				}
			}
		}
	}

	sort.Strings(issues)
	return issues
}
