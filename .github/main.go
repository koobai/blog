package main

import (
	"crypto/md5"
	"flag"
	"fmt"
	"github.com/upyun/go-sdk/v3/upyun"
	"io/ioutil"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"time"
)

type UpYunDeployer struct {
	up       *upyun.UpYun
	basicDir string
}

func (d *UpYunDeployer) GetAllRemoteFiles() (map[string]int, map[string]int) {
	return d.GetAllRemoteFilesByPath("/")
}

func (d *UpYunDeployer) GetAllRemoteFilesByPath(path string) (map[string]int, map[string]int) {
	objsChan := make(chan *upyun.FileInfo)

	go func() {
		objsChan <- &upyun.FileInfo{
			Name:  path,
			IsDir: true,
		}
	}()

	counter := 0

	files := make(map[string]int)
	directories := make(map[string]int)

	for obj := range objsChan {
		if obj == nil {
			counter--
			if counter == 0 {
				break
			}
			continue
		}

		depth := 1
		if obj.Name != "/" {
			obj.Name = strings.Trim(obj.Name, "/")
			depth = len(strings.Split(obj.Name, "/"))
		}

		if !obj.IsDir {
			files[obj.Name] = depth
			continue
		}

		directories[obj.Name] = depth
		go d.listDirs(obj.Name, objsChan)
		counter++
	}

	return files, directories
}

func (d *UpYunDeployer) UploadFiles() {
	files, dirs := d.GetAllRemoteFiles()

	var urls []string
	wg := &sync.WaitGroup{}

	err := filepath.Walk(d.basicDir, func(filename string, file os.FileInfo, err error) error {
		if err != nil {
			return err
		}

		relativeFilename := strings.Trim(strings.ReplaceAll(filename, d.basicDir, ""), "/")

		if file.IsDir() || strings.HasPrefix(file.Name(), ".") || strings.HasPrefix(relativeFilename, ".") {
			fmt.Printf("[%s] skiped!\n", relativeFilename)
			return nil
		}

		delete(files, relativeFilename)
		urls = append(urls, relativeFilename)

		str := ""
		segments := strings.Split(strings.Trim(strings.ReplaceAll(relativeFilename, file.Name(), ""), "/"), "/")
		for _, segment := range segments {
			str = filepath.Join(str, segment)
			if _, ok := dirs[str]; ok {
				delete(dirs, str)
			}
		}

		go d.handleFile(wg, filename, relativeFilename)

		return nil
	})

	wg.Wait()

	if err != nil {
		fmt.Printf("err: %s\n", err)
		return
	}

	failUrls, err := d.up.Purge(urls)
	if err != nil {
		fmt.Printf("purge failed urls: %v, err: %s\n", failUrls, err)
	}

	delete(dirs, "/")

	d.deleteFiles(files)
	d.deleteDirs(dirs)
}

func (d *UpYunDeployer) deleteFiles(files map[string]int) {
	fmt.Println("deleting files...")
	for file := range files {
		_ = d.up.Delete(&upyun.DeleteObjectConfig{
			Path:  file,
			Async: true,
		})
		fmt.Printf("[%s] deleted!\n", file)
	}
}

func (d *UpYunDeployer) deleteDirs(dirs map[string]int) {
	fmt.Println("deleting dirs...")

	maxDepth := 0
	for _, depth := range dirs {
		if depth > maxDepth {
			maxDepth = depth
		}
	}

	sortedDirs := make([]string, 0)
	for maxDepth > 0 {
		for dir, depth := range dirs {
			if depth == maxDepth {
				sortedDirs = append(sortedDirs, dir)
			}
		}
		maxDepth--
	}

	for _, dir := range sortedDirs {
		_ = d.up.Delete(&upyun.DeleteObjectConfig{
			Path: dir,
		})
		fmt.Printf("[%s] deleted!\n", dir)
	}
}

func (d *UpYunDeployer) handleFile(wg *sync.WaitGroup, filename string, relativeFilename string) {
	wg.Add(1)
	defer wg.Done()

	data, err := ioutil.ReadFile(filename)
	if err != nil {
		fmt.Printf("[%s] read file failed, reason: %s\n", relativeFilename, err)
		return
	}

	contentType := detectContentType(filename, data)

	remoteFileInfo, err := d.up.GetInfo(relativeFilename)
	putObjectConfig := &upyun.PutObjectConfig{
		Path:      relativeFilename,
		LocalPath: filename,
		Headers: map[string]string{
			"Content-Type": contentType,
		},
	}

	if upyun.IsNotExist(err) {
		d.uploadFile(putObjectConfig, false)
		return
	}

	if err != nil {
		return
	}

	if remoteFileInfo.ContentType == contentType && remoteFileInfo.MD5 == fmt.Sprintf("%x", md5.Sum(data)) {
		fmt.Printf("[%s] cached!\n", relativeFilename)
		return
	}

	err = d.up.Delete(&upyun.DeleteObjectConfig{Path: relativeFilename})
	if err != nil {
		return
	}

	d.uploadFile(putObjectConfig, true)
}

func (d *UpYunDeployer) uploadFile(putObjectConfig *upyun.PutObjectConfig, refresh bool) {
	action := "upload"
	if refresh {
		action = "refresh"
	}
	err := d.up.Put(putObjectConfig)
	if err == nil {
		fmt.Printf("[%s] %sed!\n", putObjectConfig.Path, action)
	} else {
		fmt.Printf("[%s] %s failed !\n", putObjectConfig.Path, action)
	}
}

func (d UpYunDeployer) listDirs(path string, ch chan *upyun.FileInfo) {
	objsChan := make(chan *upyun.FileInfo)
	go func() {
		err := d.up.List(&upyun.GetObjectsConfig{
			Path:        path,
			ObjectsChan: objsChan,
			Headers: map[string]string{
				"X-List-Limit": "10000",
			},
		})
		if err != nil {
			fmt.Println("err:", err)
		}
	}()

	for obj := range objsChan {
		obj.Name = filepath.Join(path, obj.Name)
		ch <- obj
	}
	ch <- nil
}

func getCurrentExecutePath() string {
	ex, err := os.Executable()
	if err != nil {
		panic(err)
	}
	return filepath.Dir(ex)
}

func getBasicDir(workDir string, level int) string {
	segments := strings.Split(strings.Trim(getCurrentExecutePath(), "/"), "/")
	max := len(segments) - level

	basicDir := "/"
	for i, segment := range segments {
		if i < max {
			basicDir = filepath.Join(basicDir, segment)
		}
	}

	return fmt.Sprintf("%s/%s", basicDir, workDir)
}

func detectContentType(filename string, data []byte) string {
	switch filepath.Ext(filename) {
	case ".css":
		return "text/css; charset=utf-8"
	case ".woff2":
		return "font/woff2"
	default:
		return http.DetectContentType(data)
	}
}

var bucket = flag.String("bucket", "", "")
var operator = flag.String("operator", "", "")
var password = flag.String("password", "", "")
var dir = flag.String("dir", "", "")

func main() {
	flag.Parse()

	up := upyun.NewUpYun(&upyun.UpYunConfig{
		Bucket:   *bucket,
		Operator: *operator,
		Password: *password,
	})

	deployer := &UpYunDeployer{
		up:       up,
		basicDir: getBasicDir(*dir, 2),
	}

	begin := time.Now()

	deployer.UploadFiles()

	fmt.Printf("done! consumed: %s\n", time.Since(begin))
}
